import { WishlistService } from './wishlist.service';

describe('WishlistService.getSummary', () => {
  it('calculates the available balance from transactions and active reservations for one user', async () => {
    const userId = '64f000000000000000000001';
    const transaction = (type: 'INCOME' | 'EXPENSE', value: number) => ({
      id: value.toString(16).padStart(24, '0'),
      userId,
      type,
      dateIndex: 20260701,
      createdAt: new Date(),
      updatedAt: new Date(),
      encryptedData: {
        value: JSON.stringify(value),
        date: JSON.stringify('2026-07-01T00:00:00.000Z'),
        category: JSON.stringify(type === 'INCOME' ? 'SALARY' : 'FOOD'),
        description: JSON.stringify(null),
      },
    });
    const findTransactions = jest.fn(async () => [
      transaction('INCOME', 500),
      transaction('EXPENSE', 125),
    ]);
    const findItems = jest.fn(async () => [
      { id: 'active', status: 'ACTIVE' },
      { id: 'completed', status: 'COMPLETED' },
    ]);
    const findMovements = jest.fn(async () => [
      {
        wishlistItemId: 'active',
        kind: 'DEPOSIT',
        encryptedData: {
          value: JSON.stringify(75),
          date: JSON.stringify('2026-07-01'),
          note: JSON.stringify(null),
        },
      },
      {
        wishlistItemId: 'completed',
        kind: 'DEPOSIT',
        encryptedData: {
          value: JSON.stringify(50),
          date: JSON.stringify('2026-07-01'),
          note: JSON.stringify(null),
        },
      },
    ]);
    const service = new WishlistService(
      {
        transaction: { findMany: findTransactions },
        wishlistItem: { findMany: findItems },
        wishlistMovement: { findMany: findMovements },
      } as never,
      { decrypt: (value: string) => JSON.parse(value) } as never,
      {} as never,
    );

    expect(await service.getSummary(userId)).toEqual({
      financialBalance: 375,
      totalReserved: 75,
      freeBalance: 300,
      insufficient: false,
    });
    expect(findTransactions).toHaveBeenCalledWith({ where: { userId } });
    expect(findItems).toHaveBeenCalledWith({ where: { userId } });
    expect(findMovements).toHaveBeenCalledWith({ where: { userId } });
  });
});

describe('WishlistService.getWishlistItems', () => {
  afterEach(() => jest.useRealTimers());

  it('returns progress and a monthly saving suggestion from reservation movements', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    const userId = '64f000000000000000000001';
    const item = {
      id: '64f000000000000000000002',
      userId,
      name: 'Notebook',
      desiredValue: 100,
      targetDate: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const movement = (kind: 'DEPOSIT' | 'WITHDRAWAL', value: number) => ({
      id: `${kind}-${value}`,
      userId,
      wishlistItemId: item.id,
      kind,
      createdAt: new Date(),
      encryptedData: {
        value: JSON.stringify(value),
        date: JSON.stringify('2026-10-01'),
        note: JSON.stringify(null),
      },
    });
    const service = new WishlistService(
      {
        wishlistItem: { findMany: jest.fn(async () => [item]) },
        wishlistMovement: {
          findMany: jest.fn(async () => [
            movement('DEPOSIT', 25),
            movement('WITHDRAWAL', 5),
          ]),
        },
      } as never,
      { decrypt: (value: string) => JSON.parse(value) } as never,
      {} as never,
    );

    expect(await service.getWishlistItems(userId)).toEqual([
      expect.objectContaining({
        reservedAmount: 20,
        remainingAmount: 80,
        progressPercent: 20,
        monthlySuggestion: 26.67,
        deadlineState: 'ON_TRACK',
      }),
    ]);
  });
});
