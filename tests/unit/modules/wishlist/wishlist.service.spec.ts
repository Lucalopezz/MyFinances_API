import { WishlistService } from 'src/modules/wishlist/wishlist.service';
import { WishlistRepository } from 'src/modules/wishlist/repositories/wishlist.repository';
import { WishlistMapper } from 'src/modules/wishlist/mappers/wishlist.mapper';
import { WishlistQueriesService } from 'src/modules/wishlist/services/wishlist-queries.service';

function serviceFor(prisma: never, encryption: never) {
  const repository = new WishlistRepository(prisma);
  const queries = new WishlistQueriesService(
    repository,
    new WishlistMapper(encryption),
  );
  return new WishlistService(queries, {} as never, {} as never, {} as never);
}

describe('WishlistService.getSummary', () => {
  it('calcula saldo livre das transações e reservas ativas de um usuário', async () => {
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
    const service = serviceFor(
      {
        transaction: { findMany: findTransactions },
        wishlistItem: { findMany: findItems },
        wishlistMovement: { findMany: findMovements },
      } as never,
      { decrypt: (value: string) => JSON.parse(value) } as never,
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

  it('compõe progresso e sugestão mensal pelos movimentos da reserva', async () => {
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
    const service = serviceFor(
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
