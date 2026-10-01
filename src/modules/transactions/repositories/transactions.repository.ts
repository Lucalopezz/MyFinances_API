import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  buildDateIndex,
  EncryptedTransactionRecord,
} from '../transaction-encryption.mapper';

export type TransactionPosition = { dateIndex: number; id: string };
export type TransactionSearchCandidates = {
  userId: string;
  type?: TransactionType;
  startDateIndex?: number;
  endDateIndex?: number;
  position?: TransactionPosition;
};
export type TransactionExportCandidates = {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
};

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Record<string, unknown>,
  ): Promise<EncryptedTransactionRecord> {
    return this.prisma.transaction.create({
      data: data as never,
    }) as unknown as Promise<EncryptedTransactionRecord>;
  }

  async findPage(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { dateIndex: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items: items as unknown as EncryptedTransactionRecord[], total };
  }

  async findSearchBatch(
    candidates: TransactionSearchCandidates,
    take: number,
  ): Promise<EncryptedTransactionRecord[]> {
    const { userId, type, startDateIndex, endDateIndex, position } = candidates;
    const where: Prisma.TransactionWhereInput = {
      userId,
      type,
      dateIndex:
        startDateIndex !== undefined || endDateIndex !== undefined
          ? { gte: startDateIndex, lte: endDateIndex }
          : undefined,
      ...(position
        ? {
            OR: [
              { dateIndex: { lt: position.dateIndex } },
              { dateIndex: position.dateIndex, id: { lt: position.id } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ dateIndex: 'desc' }, { id: 'desc' }],
      take,
    });
    return items as unknown as EncryptedTransactionRecord[];
  }

  async findOwned(
    id: string,
    userId: string,
  ): Promise<EncryptedTransactionRecord | null> {
    const item = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    return item as unknown as EncryptedTransactionRecord | null;
  }

  async updateOwned(
    id: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<EncryptedTransactionRecord> {
    await this.assertUnlinked(id, userId);
    const item = await this.prisma.transaction.update({
      where: { id, userId },
      data: data as never,
    });
    return item as unknown as EncryptedTransactionRecord;
  }

  async deleteOwned(id: string, userId: string) {
    await this.assertUnlinked(id, userId);
    return this.prisma.transaction.delete({ where: { id, userId } });
  }

  private async assertUnlinked(id: string, userId: string) {
    const cardPayment = await this.prisma.cardPayment.findFirst({
      where: { userId, transactionIds: { has: id } },
    });
    if (cardPayment)
      throw new BadRequestException(
        'Transação vinculada a uma fatura. Corrija o pagamento pelo cartão.',
      );
    const purchase = await this.prisma.wishlistItem.findFirst({
      where: { userId, purchaseTransactionId: id },
    });
    if (purchase)
      throw new BadRequestException(
        'Transação vinculada a uma compra concluída. Use um fluxo específico de correção da compra.',
      );
    const receipt = await this.prisma.calendarReceipt.findFirst({
      where: { userId, transactionId: id },
    });
    if (receipt)
      throw new BadRequestException(
        'Transação vinculada ao calendário. Para despesas, desmarque o pagamento na despesa fixa. Recebimentos confirmados preservam o histórico e não podem ser alterados por esta rota.',
      );
  }

  async findByPeriod(
    userId: string,
    startDateIndex: number,
    endDateIndex: number,
  ): Promise<EncryptedTransactionRecord[]> {
    const items = await this.prisma.transaction.findMany({
      where: { userId, dateIndex: { gte: startDateIndex, lte: endDateIndex } },
    });
    return items as unknown as EncryptedTransactionRecord[];
  }

  async findExpenseBatch(
    userId: string,
    startDateIndex: number,
    endDateIndex: number,
    cursorId: string | undefined,
    take: number,
  ): Promise<EncryptedTransactionRecord[]> {
    const items = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        dateIndex: { gte: startDateIndex, lte: endDateIndex },
      },
      orderBy: { id: 'asc' },
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return items as unknown as EncryptedTransactionRecord[];
  }

  countExportCandidates(candidates: TransactionExportCandidates) {
    return this.prisma.transaction.count({
      where: this.exportWhere(candidates),
    });
  }

  async findExportBatch(
    candidates: TransactionExportCandidates,
    cursorId: string | undefined,
    take: number,
  ): Promise<EncryptedTransactionRecord[]> {
    const items = await this.prisma.transaction.findMany({
      where: this.exportWhere(candidates),
      select: {
        id: true,
        encryptedData: true,
        dateIndex: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
      orderBy: { id: 'asc' },
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return items as unknown as EncryptedTransactionRecord[];
  }

  private exportWhere(
    candidates: TransactionExportCandidates,
  ): Prisma.TransactionWhereInput {
    const { userId, type, startDate, endDate } = candidates;
    return {
      userId,
      type,
      dateIndex:
        startDate || endDate
          ? {
              gte: startDate ? buildDateIndex(startDate) : undefined,
              lte: endDate ? buildDateIndex(endDate) : undefined,
            }
          : undefined,
    };
  }
}
