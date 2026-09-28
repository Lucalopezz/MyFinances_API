import { BudgetsService } from './budgets.service';
import { MonthlyBudgetsRepository } from './repositories/monthly-budgets.repository';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';

describe('BudgetsService.summary', () => {
  it('sums monthly expenses by decrypted category in multiple batches', async () => {
    const userId = '64f000000000000000000001';
    const records = Array.from({ length: 201 }, (_, index) => ({
      id: (index + 1).toString(16).padStart(24, '0'),
      userId,
      type: 'EXPENSE',
      dateIndex: 20260701,
      encryptedData: {
        value: JSON.stringify(2),
        date: JSON.stringify('2026-07-01T00:00:00.000Z'),
        category: JSON.stringify(index === 200 ? 'FOOD' : 'HOUSING'),
        description: JSON.stringify(null),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const findMany = jest.fn(async ({ where, take, cursor }) => {
      expect(where).toMatchObject({
        userId,
        type: 'EXPENSE',
        dateIndex: { gte: 20260701, lte: 20260731 },
      });
      const start = cursor
        ? records.findIndex((item) => item.id === cursor.id) + 1
        : 0;
      return records.slice(start, start + take);
    });
    const prisma = {
      monthlyBudget: {
        findMany: async () => [
          {
            id: 'budget',
            userId,
            monthKey: '2026-07',
            category: 'FOOD',
            limitAmount: 10,
          },
        ],
      },
      transaction: { findMany },
    };
    const service = new BudgetsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new MonthlyBudgetsRepository(prisma as never),
      new TransactionsRepository(prisma as never),
      { decrypt: (value: string) => JSON.parse(value) } as never,
    );

    expect(await service.summary('2026-07', userId)).toMatchObject([
      { category: 'FOOD', spentAmount: 2, remainingAmount: 8 },
    ]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

describe('BudgetsService writes', () => {
  it('keeps all mutations scoped to the owner', async () => {
    const userId = '64f000000000000000000001';
    const id = '64f000000000000000000050';
    const budget = {
      id,
      userId,
      monthKey: '2026-07',
      category: 'FOOD',
      limitAmount: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = jest.fn(async () => budget);
    const findFirst = jest.fn(async () => budget);
    const update = jest.fn(async () => ({ ...budget, limitAmount: 200 }));
    const remove = jest.fn(async () => budget);
    const service = new BudgetsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new MonthlyBudgetsRepository({
        monthlyBudget: {
          create,
          findFirst,
          update,
          delete: remove,
        },
      } as never),
      {} as never,
      {} as never,
    );

    expect(
      await service.create(
        { monthKey: '2026-07', category: 'FOOD', limitAmount: 100 },
        userId,
      ),
    ).toEqual(budget);
    expect(create).toHaveBeenCalledWith({
      data: { userId, monthKey: '2026-07', category: 'FOOD', limitAmount: 100 },
    });
    expect(
      await service.update(id, { limitAmount: 200 }, userId),
    ).toMatchObject({ limitAmount: 200 });
    expect(update).toHaveBeenCalledWith({
      where: { id, userId },
      data: { limitAmount: 200 },
    });
    expect(await service.remove(id, userId)).toEqual(budget);
    expect(remove).toHaveBeenCalledWith({ where: { id, userId } });
  });
});
