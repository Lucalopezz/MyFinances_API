import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { TransactionsService } from 'src/modules/transactions/transactions.service';
import { CategoriesModule } from 'src/modules/categories/categories.module';
import { CategoriesService } from 'src/modules/categories/categories.service';
import { CategoryRulesService } from 'src/modules/categories/rules/category-rules.service';
import { BudgetsModule } from 'src/modules/budgets/budgets.module';
import { BudgetsService } from 'src/modules/budgets/budgets.service';
import { createTestDatabase } from '../../../support/test-database';

describe('Livro financeiro, categorias e orçamentos com MongoDB real', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let module: TestingModule;
  let transactions: TransactionsService;
  let categories: CategoriesService;
  let rules: CategoryRulesService;
  let budgets: BudgetsService;
  const owner = '64f000000000000000000001';
  const other = '64f000000000000000000002';
  const date = new Date('2026-01-15T00:00:00Z');
  const expense = {
    type: 'EXPENSE' as const,
    date,
    value: 10.25,
    category: 'FOOD',
    description: 'Café',
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    module = await Test.createTestingModule({
      imports: [TransactionsModule, CategoriesModule, BudgetsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.db)
      .compile();
    transactions = module.get(TransactionsService);
    categories = module.get(CategoriesService);
    rules = module.get(CategoryRulesService);
    budgets = module.get(BudgetsService);
  });

  beforeEach(async () => {
    await database.db.transaction.deleteMany();
    await database.db.monthlyBudget.deleteMany();
    await database.db.categoryRule.deleteMany();
    await database.db.category.deleteMany();
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await database?.close();
    }
  });

  it('criptografa os campos sensíveis e preserva os demais campos em uma edição parcial', async () => {
    const item = await transactions.createTransaction(expense, owner);
    const stored = await database.db.transaction.findUniqueOrThrow({
      where: { id: item.id },
    });
    // Transações protegem cada campo separadamente, mantendo índices consultáveis.
    for (const encrypted of Object.values(stored.encryptedData)) {
      expect(encrypted).toMatch(/^v1:/);
    }
    expect(JSON.stringify(stored)).not.toContain('Café');
    expect(stored.dateIndex).toBe(20260115);
    expect(
      await transactions.updateTransaction(
        item.id,
        { type: 'EXPENSE', value: 11.99 },
        owner,
      ),
    ).toMatchObject({ ...expense, value: 11.99 });
    expect(await transactions.getTotalBalance(owner)).toMatchObject({
      totalExpense: 11.99,
      balance: -11.99,
    });
  });

  it('bloqueia leitura, edição e exclusão de lançamento alheio sem alterar o registro', async () => {
    const item = await transactions.createTransaction(expense, owner);
    await expect(
      transactions.getTransaction(item.id, other),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      transactions.updateTransaction(
        item.id,
        { type: 'EXPENSE', value: 99 },
        other,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      transactions.deleteTransaction(item.id, other),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await transactions.getTransactions({ page: 1, limit: 20 }, other),
    ).toMatchObject({ data: [], meta: { total: 0 } });
    expect((await transactions.getTransaction(item.id, owner)).value).toBe(
      10.25,
    );
  });

  it('pagina por data e ID sem pular ou repetir lançamentos no mesmo dia', async () => {
    const items = await Promise.all(
      Array.from({ length: 5 }, () =>
        transactions.createTransaction(expense, owner),
      ),
    );
    await transactions.createTransaction(expense, other);
    const first = await transactions.searchTransactions({ limit: 2 }, owner);
    const second = await transactions.searchTransactions(
      { limit: 2, cursor: first.nextCursor },
      owner,
    );
    const third = await transactions.searchTransactions(
      { limit: 2, cursor: second.nextCursor },
      owner,
    );
    expect(
      [...first.data, ...second.data, ...third.data]
        .map((item) => item.id)
        .sort(),
    ).toEqual(items.map((item) => item.id).sort());
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
    await expect(
      transactions.searchTransactions(
        { limit: 2, cursor: first.nextCursor },
        other,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transactions.searchTransactions(
        { limit: 2, cursor: first.nextCursor, type: 'EXPENSE' },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('arquivar categoria preserva o histórico e bloqueia novos usos e novas sugestões', async () => {
    const category = await categories.create(
      {
        name: 'Cafeteria',
        type: 'EXPENSE',
        color: '#aabbcc',
        icon: 'Utensils',
      },
      owner,
    );
    const rule = await rules.createRule(
      {
        type: 'EXPENSE',
        category: category.id,
        contains: 'café',
        priority: 1,
        enabled: true,
      },
      owner,
    );
    const item = await transactions.createTransaction(
      { ...expense, category: category.id },
      owner,
    );
    expect(
      await categories.resolve(
        { type: 'EXPENSE', description: 'CAFÉ especial' },
        owner,
      ),
    ).toMatchObject({ category: category.id, ruleId: rule.id });
    await categories.update(category.id, { archived: true }, owner);
    expect((await transactions.getTransaction(item.id, owner)).category).toBe(
      category.id,
    );
    expect(
      await transactions.updateTransaction(
        item.id,
        { type: 'EXPENSE', description: 'Correção' },
        owner,
      ),
    ).toMatchObject({ category: category.id });
    await expect(
      transactions.createTransaction(
        { ...expense, category: category.id },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await categories.resolve({ type: 'EXPENSE', description: 'Café' }, owner),
    ).toMatchObject({ category: null });
    expect(
      await rules.updateRule(rule.id, { enabled: false }, owner),
    ).toMatchObject({ enabled: false });
  });

  it('isola categorias e regras do catálogo de outro usuário', async () => {
    const category = await categories.create(
      { name: 'Privada', type: 'EXPENSE', color: '#aabbcc', icon: 'Tag' },
      owner,
    );
    const rule = await rules.createRule(
      {
        type: 'EXPENSE',
        category: category.id,
        contains: 'café',
        priority: 1,
        enabled: true,
      },
      owner,
    );
    expect(
      (await categories.list(other)).some((item) => item.id === category.id),
    ).toBe(false);
    expect(await rules.listRules(other)).toEqual([]);
    await expect(
      categories.update(category.id, { name: 'Invadida' }, other),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(rules.removeRule(rule.id, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      transactions.createTransaction(
        { ...expense, category: category.id },
        other,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('o índice único permite só um orçamento por usuário, mês e categoria', async () => {
    const input = { monthKey: '2026-01', category: 'FOOD', limitAmount: 100 };
    const results = await Promise.allSettled([
      budgets.create(input, owner),
      budgets.create(input, owner),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      (
        results.find(
          (result) => result.status === 'rejected',
        ) as PromiseRejectedResult
      ).reason,
    ).toBeInstanceOf(ConflictException);
    await expect(budgets.create(input, other)).resolves.toMatchObject({
      userId: other,
    });
    await expect(
      budgets.create({ ...input, monthKey: '2026-02' }, owner),
    ).resolves.toBeDefined();
  });

  it('recalcula gastos do orçamento após edição e exclusão, isolando mês e usuário', async () => {
    await budgets.create(
      { monthKey: '2026-01', category: 'FOOD', limitAmount: 100 },
      owner,
    );
    const item = await transactions.createTransaction(expense, owner);
    await transactions.createTransaction(
      { ...expense, date: new Date('2026-02-01T00:00:00Z') },
      owner,
    );
    await transactions.createTransaction(expense, other);
    await transactions.createTransaction(
      { type: 'INCOME', date, value: 100, category: 'SALARY' },
      owner,
    );
    expect(await budgets.summary('2026-01', owner)).toEqual([
      expect.objectContaining({ spentAmount: 10.25, remainingAmount: 89.75 }),
    ]);
    await transactions.updateTransaction(
      item.id,
      { type: 'EXPENSE', value: 120 },
      owner,
    );
    expect(await budgets.summary('2026-01', owner)).toEqual([
      expect.objectContaining({ spentAmount: 120, remainingAmount: -20 }),
    ]);
    await transactions.deleteTransaction(item.id, owner);
    expect(await budgets.summary('2026-01', owner)).toEqual([
      expect.objectContaining({ spentAmount: 0, remainingAmount: 100 }),
    ]);
  });
});
