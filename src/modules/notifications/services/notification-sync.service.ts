import { Injectable } from '@nestjs/common';
import { todayKey } from 'src/common/date/civil-date';
import { FixedExpenseRecurrenceService } from '../../fixed-expenses/services/fixed-expense-recurrence.service';
import {
  expenseNotification,
  legacyNotificationDelivered,
  needsNotificationSync,
  notificationResolution,
} from '../domain/notification-rules';
import { NotificationSyncRepository } from '../repositories/notification-sync.repository';

/** Coordena a avaliação sob demanda; o repository mantém apenas persistência e concorrência. */
@Injectable()
export class NotificationSyncService {
  constructor(
    private readonly repository: NotificationSyncRepository,
    private readonly recurrence: FixedExpenseRecurrenceService,
  ) {}

  /** A entrada autenticada no app renova ciclos antes da avaliação de vencimentos. */
  async synchronize(userId: string) {
    await this.recurrence.refreshRecurringExpenses(userId);
    return this.evaluate(userId);
  }

  /** Mutações já concluídas podem forçar avaliação sem renovar novamente os ciclos. */
  evaluate(userId: string, force = false) {
    return this.repository.atomic(async (tx) => {
      const now = new Date();
      const today = todayKey();
      const state = await this.repository.findState(userId, tx);
      if (!needsNotificationSync(state, now, today, force))
        return {
          processed: false,
          created: 0,
          resolved: 0,
          checkedAt: state!.lastCheckedAt,
        };
      await this.repository.claimRound(userId, now, today, tx);
      const expenses = await this.repository.findExpenses(userId, tx);
      const active = await this.repository.findActive(userId, tx);
      const byId = new Map(expenses.map((expense) => [expense.id, expense]));
      const activeExpenseIds = new Set(
        active.map((notification) => notification.sourceExpenseId),
      );
      let created = 0;
      let resolved = 0;

      for (const expense of expenses) {
        if (
          !expenseNotification(expense, today) &&
          !activeExpenseIds.has(expense.id)
        )
          continue;
        await this.repository.touchExpense(expense, userId, tx);
      }
      for (const notification of active) {
        const resolution = notificationResolution(
          byId.get(notification.sourceExpenseId!),
          notification,
          today,
        );
        if (!resolution) continue;
        await this.repository.resolve(
          notification.id,
          userId,
          now,
          resolution,
          tx,
        );
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
        const delivered = await this.repository.findDelivery(key, tx);
        if (delivered) {
          // Um recibo cuja notificação foi excluída é definitivo; não recria o evento.
          if (delivered.notificationId) {
            const notification = await this.repository.findNotification(
              delivered.notificationId,
              userId,
              tx,
            );
            if (notification)
              await this.repository.updateNotification(
                notification.id,
                userId,
                {
                  title: data.title,
                  message: data.message,
                  resolvedAt: null,
                  resolution: null,
                  // Só a reabertura muda a leitura; atualizar texto relativo preserva avisos lidos.
                  ...(notification.resolvedAt ? { read: false } : {}),
                },
                tx,
              );
          }
          continue;
        }
        const legacyAlreadySent = legacyNotificationDelivered(
          data.event,
          data.dueDateKey,
          expense.lastNotificationDueDate,
        );
        const notification = legacyAlreadySent
          ? null
          : await this.repository.createNotification(
              userId,
              expense.id,
              data,
              tx,
            );
        await this.repository.createDelivery(key, notification?.id ?? null, tx);
        if (notification) created++;
        if (data.event === 'UPCOMING')
          await this.repository.markUpcomingDelivered(expense, userId, tx);
      }
      return { processed: true, created, resolved, checkedAt: now };
    });
  }
}
