import { WishlistService } from './wishlist.service';
import { WishlistRepository } from './repositories/wishlist.repository';

describe('WishlistService', () => {
  it('preserves the annual net savings calculation and user-scoped update', async () => {
    const userId = '64f000000000000000000001';
    const record = (type: 'INCOME' | 'EXPENSE', value: number) => ({
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
    const findMany = jest.fn(async () => [
      record('INCOME', 500),
      record('EXPENSE', 125),
    ]);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const service = new WishlistService(
      new WishlistRepository({
        transaction: { findMany },
        wishlistItem: { updateMany },
      } as never),
      { decrypt: (value: string) => JSON.parse(value) } as never,
    );

    await service.updateWishlistItemsSavings(userId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId },
      data: { savedAmount: 375 },
    });
  });
});
