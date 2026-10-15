import { createTestApp, TestApp, TestUser } from '../support/test-app';

describe('Transações, categorias, orçamentos e dashboard pela API', () => {
  let context: TestApp;
  let user: TestUser;
  let other: TestUser;
  const period = { startDate: '2026-01-01', endDate: '2026-01-31' };
  const expense = {
    type: 'EXPENSE',
    value: 25.5,
    date: '2026-01-15',
    category: 'FOOD',
    description: 'Mercado',
  };

  beforeAll(async () => {
    context = await createTestApp();
  });
  beforeEach(async () => {
    user = await context.register();
    other = await context.register();
  });
  afterAll(async () => context?.close());

  it('cria, lista, edita e exclui uma transação, atualizando o saldo', async () => {
    const created = await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({
      ...expense,
      date: '2026-01-15T00:00:00.000Z',
    });
    expect(created.body).not.toHaveProperty('encryptedData');
    const list = await context
      .http()
      .get('/transactions')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({
      data: [expect.objectContaining({ id })],
      meta: { total: 1 },
    });
    await context
      .http()
      .patch(`/transactions/${id}`)
      .auth(user.token, { type: 'bearer' })
      .send({ type: 'EXPENSE', value: 30 })
      .expect(200);
    const balance = await context
      .http()
      .get('/transactions/balance')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(balance.body).toEqual({
      totalIncome: 0,
      totalExpense: 30,
      balance: -30,
      count: 1,
    });
    await context
      .http()
      .delete(`/transactions/${id}`)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    await context
      .http()
      .get(`/transactions/${id}`)
      .auth(user.token, { type: 'bearer' })
      .expect(404);
    const empty = await context
      .http()
      .get('/transactions/balance')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(empty.body.balance).toBe(0);
  });

  it('isola transações por usuário em consultas e mutações', async () => {
    const created = await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    const path = `/transactions/${created.body.id}`;
    await context
      .http()
      .get(path)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await context
      .http()
      .patch(path)
      .auth(other.token, { type: 'bearer' })
      .send({ type: 'EXPENSE', value: 99 })
      .expect(404);
    await context
      .http()
      .delete(path)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    const search = await context
      .http()
      .get('/transactions/search')
      .auth(other.token, { type: 'bearer' })
      .expect(200);
    expect(search.body.data).toEqual([]);
    const preserved = await context
      .http()
      .get(path)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(preserved.body.value).toBe(25.5);
  });

  it('pagina a busca filtrada e recusa cursor usado com outro filtro ou usuário', async () => {
    const ids: string[] = [];
    for (const description of [
      'Mercado A',
      'Farmácia',
      'Mercado B',
      'Mercado C',
    ]) {
      const result = await context
        .http()
        .post('/transactions')
        .auth(user.token, { type: 'bearer' })
        .send({ ...expense, description })
        .expect(201);
      if (description.startsWith('Mercado')) ids.push(result.body.id);
    }
    const query = { ...period, search: 'mercado', limit: 2 };
    const first = await context
      .http()
      .get('/transactions/search')
      .auth(user.token, { type: 'bearer' })
      .query(query)
      .expect(200);
    expect(first.body.hasMore).toBe(true);
    const second = await context
      .http()
      .get('/transactions/search')
      .auth(user.token, { type: 'bearer' })
      .query({ ...query, cursor: first.body.nextCursor })
      .expect(200);
    expect(
      [...first.body.data, ...second.body.data].map((row) => row.id).sort(),
    ).toEqual(ids.sort());
    expect(second.body).toMatchObject({ hasMore: false, nextCursor: null });
    await context
      .http()
      .get('/transactions/search')
      .auth(user.token, { type: 'bearer' })
      .query({ ...query, search: 'farmácia', cursor: first.body.nextCursor })
      .expect(400);
    await context
      .http()
      .get('/transactions/search')
      .auth(other.token, { type: 'bearer' })
      .query({ ...query, cursor: first.body.nextCursor })
      .expect(400);
  });

  it('recusa entradas inválidas antes de gravar e rejeita intervalos invertidos', async () => {
    for (const body of [
      { ...expense, date: 'data inválida' },
      { ...expense, type: 'INVALID' },
      { ...expense, category: 'SALARY' },
    ]) {
      await context
        .http()
        .post('/transactions')
        .auth(user.token, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
    await context
      .http()
      .get('/transactions/search')
      .auth(user.token, { type: 'bearer' })
      .query({ startDate: '2026-02-30' })
      .expect(400);
    await context
      .http()
      .get('/transactions/summary')
      .auth(user.token, { type: 'bearer' })
      .query({ startDate: '2026-02-01', endDate: '2026-01-01' })
      .expect(400);
  });

  it('classifica por regra, preserva o histórico ao arquivar e permite remover a regra', async () => {
    const category = await context
      .http()
      .post('/categories')
      .auth(user.token, { type: 'bearer' })
      .send({
        name: 'Cafeterias',
        type: 'EXPENSE',
        color: '#aabbcc',
        icon: 'Utensils',
      })
      .expect(201);
    const rule = await context
      .http()
      .post('/category-rules')
      .auth(user.token, { type: 'bearer' })
      .send({
        type: 'EXPENSE',
        category: category.body.id,
        contains: 'café',
        priority: 1,
        enabled: true,
      })
      .expect(201);
    const resolved = await context
      .http()
      .post('/categories/resolve')
      .auth(user.token, { type: 'bearer' })
      .send({ type: 'EXPENSE', description: 'CAFÉ especial' })
      .expect(201);
    expect(resolved.body).toMatchObject({
      category: category.body.id,
      ruleId: rule.body.id,
      source: 'rule',
    });
    const item = await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send({ ...expense, category: category.body.id })
      .expect(201);
    await context
      .http()
      .patch(`/categories/${category.body.id}`)
      .auth(other.token, { type: 'bearer' })
      .send({ archived: true })
      .expect(404);
    await context
      .http()
      .patch(`/categories/${category.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .send({ archived: true })
      .expect(200);
    await context
      .http()
      .get(`/transactions/${item.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send({ ...expense, category: category.body.id })
      .expect(400);
    await context
      .http()
      .patch(`/category-rules/${rule.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .send({ enabled: false })
      .expect(200);
    await context
      .http()
      .delete(`/category-rules/${rule.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
  });

  it('mantém orçamento, resumo e dashboard coerentes com lançamentos do período', async () => {
    const budget = await context
      .http()
      .post('/budgets')
      .auth(user.token, { type: 'bearer' })
      .send({ monthKey: '2026-01', category: 'FOOD', limitAmount: 100 })
      .expect(201);
    await context
      .http()
      .post('/budgets')
      .auth(user.token, { type: 'bearer' })
      .send({ monthKey: '2026-01', category: 'FOOD', limitAmount: 200 })
      .expect(409);
    await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send({
        type: 'INCOME',
        value: 200,
        date: '2026-01-01',
        category: 'SALARY',
      })
      .expect(201);
    await context
      .http()
      .post('/transactions')
      .auth(other.token, { type: 'bearer' })
      .send({ ...expense, value: 999 })
      .expect(201);
    const summary = await context
      .http()
      .get('/transactions/summary')
      .auth(user.token, { type: 'bearer' })
      .query(period)
      .expect(200);
    expect(summary.body).toEqual({
      totalIncome: 200,
      totalExpense: 25.5,
      balance: 174.5,
      count: 2,
    });
    const dashboard = await context
      .http()
      .get('/dashboard')
      .auth(user.token, { type: 'bearer' })
      .query(period)
      .expect(200);
    expect(dashboard.body).toMatchObject({
      totalIncomes: 200,
      totalExpenses: 25.5,
      balance: 174.5,
      economyRate: 87.25,
      highestSpendingCategory: { category: 'FOOD', total: 25.5 },
    });
    const spent = await context
      .http()
      .get('/budgets/summary')
      .auth(user.token, { type: 'bearer' })
      .query({ month: '2026-01' })
      .expect(200);
    expect(spent.body).toEqual([
      expect.objectContaining({ spentAmount: 25.5, remainingAmount: 74.5 }),
    ]);
    await context
      .http()
      .patch(`/budgets/${budget.body.id}`)
      .auth(other.token, { type: 'bearer' })
      .send({ limitAmount: 999 })
      .expect(404);
    await context
      .http()
      .patch(`/budgets/${budget.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .send({ limitAmount: 150 })
      .expect(200);
    await context
      .http()
      .delete(`/budgets/${budget.body.id}`)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
  });
});
