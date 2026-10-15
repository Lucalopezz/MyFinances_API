import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

/** Persistência isolada por proprietário e transações dos recebimentos recorrentes. */
@Injectable()
export class RecurringIncomesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string) {
    return this.prisma.recurringIncome.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOwned(
    id: string,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.recurringIncome.findFirst({ where: { id, userId } });
  }

  create(userId: string, encryptedData: string) {
    return this.prisma.recurringIncome.create({
      data: { userId, encryptedData },
    });
  }

  updateRevision(
    id: string,
    userId: string,
    revision: number,
    encryptedData: string,
  ) {
    return this.prisma.recurringIncome.updateMany({
      where: { id, userId, revision },
      data: { encryptedData, revision: { increment: 1 } },
    });
  }

  findReceiptByDue(
    userId: string,
    sourceId: string,
    dueDate: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.calendarReceipt.findUnique({
      where: { userId_sourceId_dueDate: { userId, sourceId, dueDate } },
    });
  }

  findReceiptByPeriod(
    userId: string,
    sourceId: string,
    periodKey: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.calendarReceipt.findUnique({
      where: { userId_sourceId_periodKey: { userId, sourceId, periodKey } },
    });
  }

  /**
   * A revisão serializa edições e confirmações. O lançamento e o snapshot usam
   * o mesmo contexto: falha no recibo desfaz também o lançamento e a revisão.
   */
  async recordConfirmation(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      sourceId: string;
      dueDate: string;
      periodKey: string;
      transaction: Prisma.TransactionUncheckedCreateInput;
      snapshot: (transactionId: string) => string;
    },
  ) {
    await tx.recurringIncome.update({
      where: { id: input.sourceId, userId: input.userId },
      data: { revision: { increment: 1 } },
    });
    const transaction = await tx.transaction.create({
      data: input.transaction,
    });
    return tx.calendarReceipt.create({
      data: {
        userId: input.userId,
        sourceId: input.sourceId,
        dueDate: input.dueDate,
        periodKey: input.periodKey,
        type: 'INCOME',
        transactionId: transaction.id,
        encryptedData: input.snapshot(transaction.id),
      },
    });
  }

  /** Após rollback, a retentativa reconhece o recibo que a outra chamada gravou. */
  async confirmationTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(callback);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new Error('Não foi possível confirmar a receita.');
  }
}
