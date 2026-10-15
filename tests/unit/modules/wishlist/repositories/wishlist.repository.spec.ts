import { Prisma } from '@prisma/client';
import { WishlistRepository } from 'src/modules/wishlist/repositories/wishlist.repository';

describe('WishlistRepository.atomic', () => {
  it('repete um conflito com rollback e usa a trava no mesmo cliente da operação', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflito', {
      code: 'P2034',
      clientVersion: 'teste',
    });
    const tx = {
      user: {
        update: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) };
    const operation = jest.fn(async (client) => {
      expect(client).toBe(tx);
      return 'confirmado';
    });
    expect(
      await new WishlistRepository(prisma as never).atomic(
        'usuario',
        operation,
      ),
    ).toBe('confirmado');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'usuario' },
      data: { reservationRevision: { increment: 1 } },
    });
  });

  it('limita conflitos a quatro tentativas e não repete falhas sem rollback garantido', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflito', {
      code: 'P2034',
      clientVersion: 'teste',
    });
    const transaction = jest.fn().mockRejectedValue(conflict);
    const repository = new WishlistRepository({
      $transaction: transaction,
    } as never);
    await expect(repository.atomic('usuario', jest.fn())).rejects.toBe(
      conflict,
    );
    expect(transaction).toHaveBeenCalledTimes(4);
    transaction.mockClear().mockRejectedValue(new Error('indisponível'));
    await expect(repository.atomic('usuario', jest.fn())).rejects.toThrow(
      'indisponível',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
