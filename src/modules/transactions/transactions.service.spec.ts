import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './repositories/transactions.repository';

const userId = '64f000000000000000000001';
const date = '2026-07-06T00:00:00.000Z';
const records = Array.from({ length: 105 }, (_, index) => {
  const number = 105 - index;
  return {
    id: number.toString(16).padStart(24, '0'),
    userId,
    dateIndex: 20260706,
    type: 'EXPENSE',
    encryptedData: {
      value: JSON.stringify(number),
      date: JSON.stringify(date),
      category: JSON.stringify(number <= 3 ? 'FOOD' : 'OTHER'),
      description: JSON.stringify(number <= 3 ? 'Mercado' : 'Diversos'),
    },
    createdAt: new Date(date),
    updatedAt: new Date(date),
  };
});

describe('TransactionsService.searchTransactions', () => {
  it('finds matches beyond the first batch and resumes after the last returned item', async () => {
    const findMany = jest.fn(async ({ where, take }) => {
      const after = where.OR?.[1]?.id?.lt;
      return records.filter((item) => !after || item.id < after).slice(0, take);
    });
    const service = new TransactionsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new TransactionsRepository({ transaction: { findMany } } as never),
      { decrypt: (value: string) => JSON.parse(value) } as never,
    );
    const query = { limit: 2, category: 'FOOD' as const };
    const first = await service.searchTransactions(query, userId);
    expect(first.data.map((item) => item.id)).toEqual([
      records[102].id,
      records[103].id,
    ]);
    expect(first.hasMore).toBe(true);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where.userId).toBe(userId);

    const second = await service.searchTransactions(
      { ...query, cursor: first.nextCursor },
      userId,
    );
    expect(second.data.map((item) => item.id)).toEqual([records[104].id]);
    expect(second).toMatchObject({ nextCursor: null, hasMore: false });
    await expect(
      service.searchTransactions(
        { ...query, category: 'OTHER', cursor: first.nextCursor },
        userId,
      ),
    ).rejects.toThrow('Cursor inválido');
  });
});

describe('TransactionsService legacy contract', () => {
  it('preserves the page-number response and database ordering', async () => {
    const findMany = jest.fn(async () => [records[0]]);
    const count = jest.fn(async () => 105);
    const service = new TransactionsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new TransactionsRepository({ transaction: { findMany, count } } as never),
      { decrypt: (value: string) => JSON.parse(value) } as never,
    );

    const result = await service.getTransactions(
      { page: 2, limit: 20 },
      userId,
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 105,
      totalPages: 6,
    });
    expect(result.data[0]).toMatchObject({
      id: records[0].id,
      value: 105,
      type: 'EXPENSE',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { dateIndex: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('creates a new encrypted record and returns plaintext fields', async () => {
    const create = jest.fn(async ({ data }) => ({
      ...data,
      id: '64f000000000000000000010',
      createdAt: new Date(date),
      updatedAt: new Date(date),
    }));
    const service = new TransactionsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new TransactionsRepository({ transaction: { create } } as never),
      {
        encrypt: (value: unknown) => JSON.stringify(value),
        decrypt: (value: string) => JSON.parse(value),
      } as never,
    );

    const result = await service.createTransaction(
      {
        type: 'EXPENSE',
        value: 25,
        date: new Date(date),
        category: 'FOOD',
        description: 'Mercado',
      },
      userId,
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId,
      dateIndex: 20260706,
      type: 'EXPENSE',
    });
    expect(result).toMatchObject({
      id: '64f000000000000000000010',
      userId,
      value: 25,
      category: 'FOOD',
      description: 'Mercado',
      type: 'EXPENSE',
    });
    expect(result).not.toHaveProperty('encryptedData');
  });

  it('keeps ownership in update and delete queries', async () => {
    const encrypted = {
      ...records[0],
      encryptedData: {
        value: JSON.stringify(10),
        date: JSON.stringify(date),
        category: JSON.stringify('FOOD'),
        description: JSON.stringify('Antes'),
      },
    };
    const update = jest.fn(async ({ data }) => ({ ...encrypted, ...data }));
    const remove = jest.fn(async () => encrypted);
    const findFirst = jest.fn(async () => encrypted);
    const service = new TransactionsService(
      {
        resolveReference: jest.fn(async () => ({})),
        list: jest.fn(async () => []),
      } as never,
      new TransactionsRepository({
        transaction: { findFirst, update, delete: remove },
        cardPayment: { findFirst: jest.fn(async () => null) },
        wishlistItem: { findFirst: jest.fn(async () => null) },
        calendarReceipt: { findFirst: jest.fn(async () => null) },
      } as never),
      {
        encrypt: (value: unknown) => JSON.stringify(value),
        decrypt: (value: string) => JSON.parse(value),
      } as never,
    );

    const updated = await service.updateTransaction(
      encrypted.id,
      { type: 'EXPENSE', value: 20 },
      userId,
    );
    expect(updated).toMatchObject({
      value: 20,
      category: 'FOOD',
      description: 'Antes',
    });
    expect(update.mock.calls[0][0].where).toEqual({ id: encrypted.id, userId });
    expect(await service.deleteTransaction(encrypted.id, userId)).toEqual({
      message: 'Deletado com sucesso!',
    });
    expect(remove).toHaveBeenCalledWith({
      where: { id: encrypted.id, userId },
    });
  });
});
