import { nextDay, todayKey } from 'src/common/date/civil-date';
import { createTestApp, TestApp, TestUser } from '../support/test-app';

describe('Planejamento e realização financeira pela API', () => {
  let context: TestApp;
  let user: TestUser;
  let other: TestUser;
  let today: string;

  beforeAll(async () => {
    context = await createTestApp();
  });
  beforeEach(async () => {
    user = await context.register();
    other = await context.register();
    today = todayKey();
  });
  afterAll(async () => context?.close());

  it('prevê receita no calendário e confirma o recebimento uma única vez', async () => {
    const income = await context
      .http()
      .post('/calendar/incomes')
      .auth(user.token, { type: 'bearer' })
      .send({
        description: 'Salário mensal',
        amount: 100,
        category: 'SALARY',
        startDate: today,
        recurrence: 'MONTHLY',
      })
      .expect(201);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
    const before = await context
      .http()
      .get('/calendar')
      .auth(user.token, { type: 'bearer' })
      .query({ month: today.slice(0, 7) })
      .expect(200);
    expect(before.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: income.body.id,
          status: 'PENDING',
          amount: 100,
        }),
      ]),
    );
    const path = `/calendar/incomes/${income.body.id}/occurrences/${today}/confirm`;
    await context
      .http()
      .post(path)
      .auth(other.token, { type: 'bearer' })
      .send({ amount: 99, date: today })
      .expect(404);
    await context
      .http()
      .post(path)
      .auth(user.token, { type: 'bearer' })
      .send({ amount: 99, date: nextDay(today) })
      .expect(400);
    const first = await context
      .http()
      .post(path)
      .auth(user.token, { type: 'bearer' })
      .send({ amount: 99, date: today })
      .expect(201);
    const repeated = await context
      .http()
      .post(path)
      .auth(user.token, { type: 'bearer' })
      .send({ amount: 88, date: today })
      .expect(201);
    expect(repeated.body).toEqual(first.body);
    expect(first.body).toMatchObject({ status: 'SETTLED', actualAmount: 99 });
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(1);
    const after = await context
      .http()
      .get('/calendar')
      .auth(user.token, { type: 'bearer' })
      .query({ month: today.slice(0, 7) })
      .expect(200);
    expect(
      after.body.events.filter((event) => event.sourceId === income.body.id),
    ).toEqual([
      expect.objectContaining({
        status: 'SETTLED',
        transactionId: first.body.transactionId,
      }),
    ]);
  });

  it('recusa revisão desatualizada de receita recorrente sem sobrescrever a edição', async () => {
    const income = await context
      .http()
      .post('/calendar/incomes')
      .auth(user.token, { type: 'bearer' })
      .send({
        description: 'Salário',
        amount: 100,
        category: 'SALARY',
        startDate: today,
        recurrence: 'MONTHLY',
      })
      .expect(201);
    const path = `/calendar/incomes/${income.body.id}`;
    await context
      .http()
      .patch(path)
      .auth(user.token, { type: 'bearer' })
      .send({ revision: income.body.revision, amount: 200 })
      .expect(200);
    await context
      .http()
      .patch(path)
      .auth(user.token, { type: 'bearer' })
      .send({ revision: income.body.revision, amount: 300 })
      .expect(409);
    const list = await context
      .http()
      .get('/calendar/incomes')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ amount: 200, effectiveFrom: nextDay(today) }),
    ]);
  });

  it('reserva saldo, retira aporte e conclui a wishlist com uma única despesa', async () => {
    await context
      .http()
      .post('/transactions')
      .auth(user.token, { type: 'bearer' })
      .send({ type: 'INCOME', value: 100, date: today, category: 'SALARY' })
      .expect(201);
    const item = await context
      .http()
      .post('/wishlist')
      .auth(user.token, { type: 'bearer' })
      .send({ name: 'Livros', desiredValue: 100 })
      .expect(201);
    const path = `/wishlist/${item.body.id}`;
    await context
      .http()
      .post(`${path}/movements`)
      .auth(other.token, { type: 'bearer' })
      .send({ kind: 'DEPOSIT', value: 10, date: today })
      .expect(404);
    await context
      .http()
      .post(`${path}/movements`)
      .auth(user.token, { type: 'bearer' })
      .send({ kind: 'DEPOSIT', value: 101, date: today })
      .expect(400);
    await context
      .http()
      .post(`${path}/movements`)
      .auth(user.token, { type: 'bearer' })
      .send({ kind: 'DEPOSIT', value: 80, date: today })
      .expect(201);
    await context
      .http()
      .post(`${path}/movements`)
      .auth(user.token, { type: 'bearer' })
      .send({ kind: 'WITHDRAWAL', value: 10, date: today })
      .expect(201);
    const summary = await context
      .http()
      .get('/wishlist/summary')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(summary.body).toMatchObject({
      financialBalance: 100,
      totalReserved: 70,
      freeBalance: 30,
    });
    const purchase = {
      value: 60,
      date: today,
      category: 'OTHER',
      description: 'Compra de livros',
    };
    const completed = await context
      .http()
      .post(`${path}/complete`)
      .auth(user.token, { type: 'bearer' })
      .send(purchase)
      .expect(201);
    const repeated = await context
      .http()
      .post(`${path}/complete`)
      .auth(user.token, { type: 'bearer' })
      .send(purchase)
      .expect(201);
    expect(completed.body).toMatchObject({
      alreadyCompleted: false,
      coveredAmount: 60,
      releasedAmount: 10,
      item: { status: 'COMPLETED', reservedAmount: 0 },
    });
    expect(repeated.body).toMatchObject({
      alreadyCompleted: true,
      transaction: { id: completed.body.transaction.id },
    });
    const final = await context
      .http()
      .get('/wishlist/summary')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(final.body).toMatchObject({
      financialBalance: 40,
      totalReserved: 0,
      freeBalance: 40,
    });
    expect(
      await context.db.transaction.count({
        where: { userId: user.id, type: 'EXPENSE' },
      }),
    ).toBe(1);
  });

  it('parcela compra, paga a fatura uma vez e estorna sem perder o histórico', async () => {
    const card = await context
      .http()
      .post('/cards')
      .auth(user.token, { type: 'bearer' })
      .send({
        name: 'Principal',
        limit: 100,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      })
      .expect(201);
    const path = `/cards/${card.body.id}`;
    const purchase = await context
      .http()
      .post(`${path}/purchases`)
      .auth(user.token, { type: 'bearer' })
      .send({
        description: 'Livros',
        amount: 100.01,
        date: '2025-01-01',
        category: 'SHOPPING',
        installments: 3,
      })
      .expect(201);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
    const detail = await context
      .http()
      .get(path)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(detail.body.invoices.map((invoice) => invoice.total)).toEqual([
      33.34, 33.34, 33.33,
    ]);
    expect(detail.body.used).toBe(33.34);
    await context
      .http()
      .get(path)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    const paymentPath = `${path}/invoices/${detail.body.invoices[0].cycle}/pay`;
    await context
      .http()
      .post(paymentPath)
      .auth(user.token, { type: 'bearer' })
      .send({ date: today })
      .expect(201);
    await context
      .http()
      .post(paymentPath)
      .auth(user.token, { type: 'bearer' })
      .send({ date: today })
      .expect(201);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(1);
    const payment = await context.db.cardPayment.findFirstOrThrow({
      where: { cardId: card.body.id },
    });
    await context
      .http()
      .delete(`/transactions/${payment.transactionIds[0]}`)
      .auth(user.token, { type: 'bearer' })
      .expect(400);
    await context
      .http()
      .post(`${path}/purchases/${purchase.body.id}/refund`)
      .auth(user.token, { type: 'bearer' })
      .expect(201);
    await context
      .http()
      .post(`${path}/purchases/${purchase.body.id}/refund`)
      .auth(user.token, { type: 'bearer' })
      .expect(201);
    expect(
      await context.db.transaction.count({
        where: { userId: user.id, type: 'INCOME' },
      }),
    ).toBe(1);
    const refunded = await context
      .http()
      .get(path)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(refunded.body.used).toBe(0);
  });

  it('pagamento de despesa fixa resolve lembrete e seu estorno restaura o saldo', async () => {
    const expense = await context
      .http()
      .post('/fixed-expenses')
      .auth(user.token, { type: 'bearer' })
      .send({
        name: 'Internet',
        amount: 100,
        category: 'OTHER',
        dueDate: `${today}T12:00:00Z`,
        recurrence: 'MONTHLY',
      })
      .expect(201);
    const path = `/fixed-expenses/${expense.body.id}/payment`;
    await context
      .http()
      .post('/notifications/sync')
      .auth(user.token, { type: 'bearer' })
      .expect(201);
    const notifications = await context
      .http()
      .get('/notifications')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(notifications.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceExpenseId: expense.body.id,
          resolvedAt: null,
        }),
      ]),
    );
    await context
      .http()
      .patch(path)
      .auth(other.token, { type: 'bearer' })
      .send({ isPaid: true })
      .expect(404);
    await context
      .http()
      .patch(path)
      .auth(user.token, { type: 'bearer' })
      .send({ isPaid: true })
      .expect(200);
    await context
      .http()
      .patch(path)
      .auth(user.token, { type: 'bearer' })
      .send({ isPaid: true })
      .expect(200);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(1);
    const resolved = await context
      .http()
      .get('/notifications')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(
      resolved.body.find(
        (notification) => notification.sourceExpenseId === expense.body.id,
      ),
    ).toMatchObject({
      resolution: 'PAID',
      resolvedAt: expect.any(String),
    });
    await context
      .http()
      .patch(path)
      .auth(user.token, { type: 'bearer' })
      .send({ isPaid: false })
      .expect(200);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
});
