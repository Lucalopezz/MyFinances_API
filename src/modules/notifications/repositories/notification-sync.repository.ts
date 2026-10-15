import { Injectable } from '@nestjs/common';
import { FixedExpense, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

type DeliveryKey = {
  userId: string;
  expenseId: string;
  dueDateKey: string;
  event: 'UPCOMING' | 'OVERDUE';
};
type NotificationData = {
  title: string;
  message: string;
  type: 'ALERT' | 'REMINDER';
  dueDateKey: string;
  event: 'UPCOMING' | 'OVERDUE';
};

/** Persiste estado, recibos e avisos usando a mesma transação de uma rodada. */
@Injectable()
export class NotificationSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Conflitos concorrentes repetem após rollback, inclusive os do índice único de entregas. */
  async atomic<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(operation);
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
    throw new Error('Não foi possível sincronizar as notificações.');
  }

  findState(userId: string, tx: Prisma.TransactionClient) {
    return tx.notificationSyncState.findUnique({ where: { id: userId } });
  }

  claimRound(
    userId: string,
    now: Date,
    today: string,
    tx: Prisma.TransactionClient,
  ) {
    // A escrita real serializa rodadas forçadas, mesmo com o mesmo relógio/data.
    return tx.notificationSyncState.upsert({
      where: { id: userId },
      create: { id: userId, lastCheckedAt: now, dayKey: today },
      update: { lastCheckedAt: now, dayKey: today, revision: { increment: 1 } },
    });
  }

  findExpenses(userId: string, tx: Prisma.TransactionClient) {
    return tx.fixedExpense.findMany({ where: { userId } });
  }

  findActive(userId: string, tx: Prisma.TransactionClient) {
    return tx.notification.findMany({
      where: {
        userId,
        sourceExpenseId: { not: null },
        OR: [{ resolvedAt: null }, { resolvedAt: { isSet: false } }],
      },
    });
  }

  touchExpense(
    expense: FixedExpense,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    // Detecta edição/pagamento concorrente e impede persistir um aviso com leitura obsoleta.
    return tx.fixedExpense.update({
      where: { id: expense.id, userId },
      data: { lastNotificationDueDate: expense.lastNotificationDueDate },
    });
  }

  resolve(
    id: string,
    userId: string,
    now: Date,
    resolution: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.notification.update({
      where: { id, userId },
      data: { resolvedAt: now, resolution, read: true },
    });
  }

  findDelivery(key: DeliveryKey, tx: Prisma.TransactionClient) {
    return tx.notificationDelivery.findUnique({
      where: { userId_expenseId_dueDateKey_event: key },
    });
  }

  findNotification(id: string, userId: string, tx: Prisma.TransactionClient) {
    return tx.notification.findFirst({ where: { id, userId } });
  }

  updateNotification(
    id: string,
    userId: string,
    data: Prisma.NotificationUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.notification.update({ where: { id, userId }, data });
  }

  createNotification(
    userId: string,
    expenseId: string,
    data: NotificationData,
    tx: Prisma.TransactionClient,
  ) {
    return tx.notification.create({
      data: { userId, sourceExpenseId: expenseId, ...data },
    });
  }

  createDelivery(
    key: DeliveryKey,
    notificationId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    return tx.notificationDelivery.create({ data: { ...key, notificationId } });
  }

  markUpcomingDelivered(
    expense: FixedExpense,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.fixedExpense.update({
      where: { id: expense.id, userId },
      data: { lastNotificationDueDate: expense.dueDate },
    });
  }
}
