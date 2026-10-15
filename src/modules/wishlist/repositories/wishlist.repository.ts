import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

/** Mantém consultas por usuário, persistência e serialização das reservas. */
@Injectable()
export class WishlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOwned(
    id: string,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.wishlistItem.findFirst({ where: { id, userId } });
  }

  findItems(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMovements(
    userId: string,
    wishlistItemId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.wishlistMovement.findMany({
      where: { userId, ...(wishlistItemId ? { wishlistItemId } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async summaryRecords(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const [transactions, items, movements] = await Promise.all([
      tx.transaction.findMany({ where: { userId } }),
      tx.wishlistItem.findMany({ where: { userId } }),
      tx.wishlistMovement.findMany({ where: { userId } }),
    ]);
    return { transactions, items, movements };
  }

  createItem(data: Prisma.WishlistItemUncheckedCreateInput) {
    return this.prisma.wishlistItem.create({ data });
  }

  updateItem(
    id: string,
    userId: string,
    data: Prisma.WishlistItemUncheckedUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.wishlistItem.update({ where: { id, userId }, data });
  }

  createMovement(
    data: Prisma.WishlistMovementUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.wishlistMovement.create({ data });
  }

  findPurchase(id: string, userId: string, tx: Prisma.TransactionClient) {
    return tx.transaction.findFirst({ where: { id, userId } });
  }

  createPurchase(
    data: Prisma.TransactionUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.transaction.create({ data });
  }

  settleMigration(userId: string) {
    return this.prisma.wishlistItem.updateMany({
      where: { userId },
      data: { reservationMigrationState: 'SETTLED' },
    });
  }

  async deleteItem(id: string, userId: string, tx: Prisma.TransactionClient) {
    await tx.wishlistMovement.deleteMany({
      where: { userId, wishlistItemId: id },
    });
    await tx.wishlistItem.delete({ where: { id, userId } });
  }

  /** Uma escrita por usuário impede dois aportes de consumir o mesmo saldo livre. */
  async atomic<T>(
    userId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.user.update({
              where: { id: userId },
              data: { reservationRevision: { increment: 1 } },
            });
            return operation(tx);
          },
          { maxWait: 5000, timeout: 20000 },
        );
      } catch (error) {
        // Somente conflitos com rollback garantido podem repetir a operação financeira.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException(
      'Conflito ao atualizar reservas. Tente novamente.',
    );
  }
}
