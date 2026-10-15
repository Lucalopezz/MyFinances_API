import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { todayKey } from 'src/common/date/civil-date';
import {
  expenseNotification,
  needsNotificationSync,
} from '../domain/notification-rules';

@Injectable()
export class NotificationSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Avalia apenas o usuário autenticado e grava estado, recibos e avisos atomicamente.
   * Falhas fazem rollback do timestamp: a próxima requisição pode tentar novamente.
   */
  async synchronize(userId: string, force = false) {
    // Conflitos de duas abas/instâncias são refeitos após a transação vencedora.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const now = new Date();
          const today = todayKey();
          const state = await tx.notificationSyncState.findUnique({
            where: { id: userId },
          });
          if (!needsNotificationSync(state, now, today, force)) {
            return {
              processed: false,
              created: 0,
              resolved: 0,
              checkedAt: state!.lastCheckedAt,
            };
          }
          // O incremento é uma escrita real, inclusive quando uma mutação força a rodada.
          await tx.notificationSyncState.upsert({
            where: { id: userId },
            create: { id: userId, lastCheckedAt: now, dayKey: today },
            update: {
              lastCheckedAt: now,
              dayKey: today,
              revision: { increment: 1 },
            },
          });
          const expenses = await tx.fixedExpense.findMany({
            where: { userId },
          });
          const active = await tx.notification.findMany({
            where: {
              userId,
              sourceExpenseId: { not: null },
              OR: [{ resolvedAt: null }, { resolvedAt: { isSet: false } }],
            },
          });
          const byId = new Map(
            expenses.map((expense) => [expense.id, expense]),
          );
          const activeExpenseIds = new Set(
            active.map((n) => n.sourceExpenseId),
          );
          let created = 0;
          let resolved = 0;

          // Toca as despesas para conflitar com pagamentos/edições concorrentes.
          // Assim nenhum aviso é gravado a partir de um estado financeiro obsoleto.
          for (const expense of expenses) {
            if (
              !expenseNotification(expense, today) &&
              !activeExpenseIds.has(expense.id)
            )
              continue;
            await tx.fixedExpense.update({
              where: { id: expense.id, userId },
              data: {
                lastNotificationDueDate: expense.lastNotificationDueDate,
              },
            });
          }
          for (const notification of active) {
            const expense = byId.get(notification.sourceExpenseId!);
            const due = expense?.dueDate.toISOString().slice(0, 10);
            const resolution = !expense
              ? 'EXPENSE_DELETED'
              : expense.isPaid
                ? 'PAID'
                : due !== notification.dueDateKey
                  ? 'DUE_DATE_CHANGED'
                  : notification.event === 'UPCOMING' && due < today
                    ? 'SUPERSEDED'
                    : null;
            if (!resolution) continue;
            await tx.notification.update({
              where: { id: notification.id, userId },
              data: { resolvedAt: now, resolution, read: true },
            });
            resolved++;
          }

          for (const expense of expenses) {
            const data = expenseNotification(expense, today);
            if (!data) continue;
            const key = {
              userId,
              expenseId: expense.id,
              dueDateKey: data.dueDateKey,
              event: data.event,
            };
            const where = { userId_expenseId_dueDateKey_event: key };
            const delivered = await tx.notificationDelivery.findUnique({
              where,
            });
            if (delivered) {
              if (delivered.notificationId) {
                // Atualiza texto relativo e edição de nome/valor. Só uma reabertura
                // (pagamento desmarcado/data restaurada) volta a ser não lida.
                const notification = await tx.notification.findFirst({
                  where: { id: delivered.notificationId, userId },
                });
                if (notification)
                  await tx.notification.update({
                    where: { id: notification.id, userId },
                    data: {
                      title: data.title,
                      message: data.message,
                      resolvedAt: null,
                      resolution: null,
                      ...(notification.resolvedAt ? { read: false } : {}),
                    },
                  });
              }
              continue;
            }
            // Preserva a deduplicação dos lembretes antigos sem vínculo estruturado.
            // O recibo sem notificationId também mantém uma exclusão definitiva.
            const legacyAlreadySent =
              data.event === 'UPCOMING' &&
              expense.lastNotificationDueDate?.toISOString().slice(0, 10) ===
                data.dueDateKey;
            const notification = legacyAlreadySent
              ? null
              : await tx.notification.create({
                  data: { userId, sourceExpenseId: expense.id, ...data },
                });
            await tx.notificationDelivery.create({
              data: { ...key, notificationId: notification?.id ?? null },
            });
            if (notification) created++;
            if (data.event === 'UPCOMING')
              await tx.fixedExpense.update({
                where: { id: expense.id, userId },
                data: { lastNotificationDueDate: expense.dueDate },
              });
          }
          return { processed: true, created, resolved, checkedAt: now };
        });
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
}
