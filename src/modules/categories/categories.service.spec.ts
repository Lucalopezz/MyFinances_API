import { Category, CategoryRule } from '@prisma/client';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import {
  CreateCategorySchema,
  CreateRuleSchema,
  UpdateCategorySchema,
} from './category.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import { BudgetsService } from '../budgets/budgets.service';
import { FixedExpensePaymentService } from '../fixed-expenses/services/fixed-expense-payment.service';

const owner = '64f000000000000000000001';
const other = '64f000000000000000000002';
const categoryId = '64f000000000000000000010';
const otherCategory = '64f000000000000000000020';
const ruleId = '64f000000000000000000030';
const now = new Date('2026-09-28T00:00:00Z');

describe('custom categories and automatic rules', () => {
  let service: CategoriesService;
  let encryption: FinancialDataEncryptionService;
  let categories: Category[];
  let rules: CategoryRule[];
  let repository: CategoriesRepository;
  const originalKey = process.env.FINANCIAL_DATA_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.FINANCIAL_DATA_ENCRYPTION_KEY =
      'category-tests-encryption-key-only';
  });
  afterAll(() => {
    if (originalKey === undefined)
      delete process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
    else process.env.FINANCIAL_DATA_ENCRYPTION_KEY = originalKey;
  });
  beforeEach(() => {
    encryption = new FinancialDataEncryptionService();
    categories = [categoryId, otherCategory].map((id, index) => ({
      id,
      userId: index ? other : owner,
      type: 'EXPENSE',
      encryptedName: encryption.encrypt('Café especial'),
      color: '#123456',
      icon: 'Tag',
      archived: false,
      createdAt: now,
      updatedAt: now,
    }));
    rules = [
      {
        id: ruleId,
        userId: owner,
        type: 'EXPENSE',
        category: categoryId,
        encryptedContains: encryption.encrypt('CAFÉ'),
        priority: 5,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    repository = new CategoriesRepository({
      category: {
        findMany: jest.fn(async ({ where }) =>
          categories.filter((c) => c.userId === where.userId),
        ),
        findFirst: jest.fn(
          async ({ where }) =>
            categories.find(
              (c) => c.id === where.id && c.userId === where.userId,
            ) ?? null,
        ),
        create: jest.fn(async ({ data }) => {
          const c = {
            ...data,
            id: '64f000000000000000000040',
            archived: false,
            createdAt: now,
            updatedAt: now,
          };
          categories.push(c);
          return c;
        }),
        update: jest.fn(async ({ where, data }) => {
          const c = categories.find(
            (c) => c.id === where.id && c.userId === where.userId,
          );
          Object.assign(c, data);
          return c;
        }),
      },
      categoryRule: {
        findMany: jest.fn(async ({ where, orderBy }) => {
          expect(orderBy).toEqual([{ priority: 'asc' }, { id: 'asc' }]);
          return rules
            .filter(
              (r) =>
                r.userId === where.userId &&
                (!where.type || r.type === where.type),
            )
            .sort(
              (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
            );
        }),
        findFirst: jest.fn(
          async ({ where }) =>
            rules.find((r) => r.id === where.id && r.userId === where.userId) ??
            null,
        ),
        create: jest.fn(async ({ data }) => {
          const r = {
            ...data,
            id: '64f000000000000000000050',
            createdAt: now,
            updatedAt: now,
          };
          rules.push(r);
          return r;
        }),
        update: jest.fn(async ({ where, data }) => {
          const r = rules.find(
            (r) => r.id === where.id && r.userId === where.userId,
          );
          Object.assign(r, data);
          return r;
        }),
        delete: jest.fn(async ({ where }) => {
          rules = rules.filter(
            (r) => r.id !== where.id || r.userId !== where.userId,
          );
        }),
      },
    } as never);
    service = new CategoriesService(repository, encryption);
  });

  it('returns all 22 legacy codes and only the owner custom catalog, without ciphertext', async () => {
    const result = await service.list(owner);
    expect(result.filter((c) => c.isDefault)).toHaveLength(22);
    expect(result.find((c) => c.id === categoryId)).toMatchObject({
      name: 'Café especial',
      archived: false,
    });
    expect(result.some((c) => c.id === otherCategory)).toBe(false);
    expect(JSON.stringify(result)).not.toContain('encryptedName');
    await expect(
      service.resolveReference('FOOD', owner, 'EXPENSE'),
    ).resolves.toMatchObject({ name: 'Alimentação' });
  });

  it.each([otherCategory, 'NOT_FOUND', 'invalid-id', 'SALARY'])(
    'rejects foreign, missing or incompatible expense category %s',
    async (id) => {
      await expect(
        service.resolveReference(id, owner, 'EXPENSE'),
      ).rejects.toThrow('Categoria inválida');
    },
  );

  it('encrypts names, keeps IDs on rename/archive, and permits historical reads only', async () => {
    const created = await service.create(
      { name: 'Curso', type: 'EXPENSE', color: '#aabbcc', icon: 'Tag' },
      owner,
    );
    expect(
      categories.find((c) => c.id === created.id).encryptedName,
    ).not.toContain('Curso');
    await service.update(
      categoryId,
      { name: 'Cafeteria', archived: true },
      owner,
    );
    await expect(
      service.resolveReference(categoryId, owner, 'EXPENSE'),
    ).rejects.toThrow('arquivada');
    await expect(
      service.resolveReference(categoryId, owner, 'EXPENSE', true),
    ).resolves.toMatchObject({ id: categoryId, name: 'Cafeteria' });
    await service.update(categoryId, { archived: false }, owner);
    await expect(
      service.resolveReference(categoryId, owner, 'EXPENSE'),
    ).resolves.toMatchObject({ archived: false });
  });

  it('does not mutate defaults or another user category/rule', async () => {
    await expect(service.update('FOOD', { name: 'x' }, owner)).rejects.toThrow(
      'não encontrado',
    );
    await expect(
      service.update(otherCategory, { archived: true }, owner),
    ).rejects.toThrow('não encontrada');
    await expect(
      service.updateRule(ruleId, { enabled: false }, other),
    ).rejects.toThrow('não encontrada');
    await expect(service.removeRule(ruleId, other)).rejects.toThrow(
      'não encontrada',
    );
    expect(await service.listRules(other)).toEqual([]);
    expect(rules[0].enabled).toBe(true);
  });

  it('normalizes case, composed/decomposed accents and honors numeric priority and ID ties', async () => {
    const input = {
      type: 'EXPENSE' as const,
      description: 'Pagamento cafe\u0301 da manhã',
    };
    expect(await service.resolve(input, owner)).toMatchObject({
      category: categoryId,
      ruleId,
    });
    rules.push({
      ...rules[0],
      id: '64f000000000000000000029',
      priority: 5,
      category: 'FOOD',
    });
    expect(await service.resolve(input, owner)).toMatchObject({
      category: 'FOOD',
    });
    rules[0].priority = 0;
    expect(await service.resolve(input, owner)).toMatchObject({
      category: categoryId,
    });
    expect(
      await service.resolve({ ...input, category: 'OTHER' }, owner),
    ).toEqual({ category: 'OTHER', ruleId: null, source: 'manual' });
  });

  it('ignores disabled rules, foreign rules, other types, archived targets and nonmatches', async () => {
    const input = { type: 'EXPENSE' as const, description: 'Café' };
    expect(await service.resolve(input, other)).toMatchObject({
      category: null,
    });
    expect(
      await service.resolve({ ...input, type: 'INCOME' }, owner),
    ).toMatchObject({ category: null });
    expect(
      await service.resolve({ ...input, description: 'Uber' }, owner),
    ).toMatchObject({ category: null });
    rules[0].enabled = false;
    expect(await service.resolve(input, owner)).toMatchObject({
      category: null,
    });
    rules[0].enabled = true;
    categories[0].archived = true;
    expect(await service.resolve(input, owner)).toMatchObject({
      category: null,
    });
    await expect(
      service.updateRule(ruleId, { enabled: false }, owner),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      service.updateRule(ruleId, { enabled: true }, owner),
    ).rejects.toThrow('arquivada');
  });

  it('tests drafts without persisting and encrypts rule text on save', async () => {
    const dto = {
      type: 'EXPENSE' as const,
      contains: 'uber',
      category: 'TRANSPORT',
      priority: 1,
      enabled: true,
    };
    expect(
      await service.testRule({ ...dto, description: 'UBER viagem' }, owner),
    ).toEqual({ matches: true, category: 'TRANSPORT' });
    expect(rules).toHaveLength(1);
    const created = await service.createRule(dto, owner);
    expect(created).toMatchObject(dto);
    expect(created).not.toHaveProperty('encryptedContains');
    expect(rules[1].encryptedContains).not.toContain('uber');
    await expect(
      service.createRule({ ...dto, category: otherCategory }, owner),
    ).rejects.toThrow('Categoria inválida');
    await service.removeRule(created.id, owner);
    expect(rules).toHaveLength(1);
  });

  it('validates color, icon, type immutability, blank matching text and priority bounds', () => {
    expect(
      CreateCategorySchema.safeParse({
        name: 'a',
        type: 'EXPENSE',
        color: 'red',
        icon: 'Tag',
      }).success,
    ).toBe(false);
    expect(UpdateCategorySchema.safeParse({ type: 'INCOME' }).success).toBe(
      false,
    );
    for (const patch of [
      { contains: ' ' },
      { priority: -1 },
      { priority: 1.5 },
      { priority: 10000 },
    ]) {
      expect(
        CreateRuleSchema.safeParse({
          type: 'EXPENSE',
          contains: 'Uber',
          category: 'TRANSPORT',
          priority: 0,
          enabled: true,
          ...patch,
        }).success,
      ).toBe(false);
    }
  });

  it('uses custom categories in encrypted transactions, search by name and budgets; preserves archived edits', async () => {
    let stored;
    const transactionRepository = new TransactionsRepository({
      transaction: {
        create: jest.fn(async ({ data }) => {
          stored = {
            ...data,
            id: '64f000000000000000000060',
            createdAt: now,
            updatedAt: now,
          };
          return stored;
        }),
        findFirst: jest.fn(async () => stored),
        findMany: jest.fn(async () => [stored]),
        update: jest.fn(async ({ data }) => {
          stored = { ...stored, ...data };
          return stored;
        }),
      },
    } as never);
    const transactions = new TransactionsService(
      service,
      transactionRepository,
      { updateWishlistItemsSavings: jest.fn() } as never,
      encryption,
    );
    const dto = {
      category: categoryId,
      type: 'EXPENSE' as const,
      date: now,
      value: 25,
      description: 'Café',
    };
    const created = await transactions.createTransaction(dto, owner);
    expect(created.category).toBe(categoryId);
    expect(encryption.decrypt(stored.encryptedData.category)).toBe(categoryId);
    expect(
      (
        await transactions.searchTransactions(
          { limit: 20, search: 'especial' },
          owner,
        )
      ).data,
    ).toHaveLength(1);
    const budgets = new BudgetsService(
      service,
      {
        findByMonth: async () => [{ category: categoryId, limitAmount: 100 }],
      } as never,
      transactionRepository,
      encryption,
    );
    expect(await budgets.summary('2026-09', owner)).toMatchObject([
      { category: categoryId, spentAmount: 25, remainingAmount: 75 },
    ]);
    categories[0].archived = true;
    await expect(transactions.createTransaction(dto, owner)).rejects.toThrow(
      'arquivada',
    );
    await expect(
      transactions.updateTransaction(
        created.id,
        { type: 'EXPENSE', value: 30, category: categoryId },
        owner,
      ),
    ).resolves.toMatchObject({ value: 30, category: categoryId });
    await expect(
      transactions.updateTransaction(created.id, { type: 'INCOME' }, owner),
    ).rejects.toThrow('Categoria inválida');
    expect(
      (
        await transactions.searchTransactions(
          { limit: 20, category: categoryId },
          owner,
        )
      ).data,
    ).toHaveLength(1);
    await expect(
      budgets.create(
        { monthKey: '2026-10', category: categoryId, limitAmount: 100 },
        owner,
      ),
    ).rejects.toThrow('arquivada');
    const markPaid = jest.fn();
    const payments = new FixedExpensePaymentService(
      service,
      { markPaid } as never,
      encryption,
    );
    await expect(
      payments.markAsPaid(
        { isPaid: false, category: categoryId } as never,
        owner,
      ),
    ).rejects.toThrow('arquivada');
    expect(markPaid).not.toHaveBeenCalled();
  });
});
