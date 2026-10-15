import { Injectable, Logger } from '@nestjs/common';
import { NotificationSyncRepository } from '../../notifications/repositories/notification-sync.repository';
import { FixedExpenseRecurrenceService } from './fixed-expense-recurrence.service';

@Injectable()
export class FixedExpenseNotificationService {
  private readonly logger = new Logger(FixedExpenseNotificationService.name);

  constructor(
    private readonly repository: NotificationSyncRepository,
    private readonly recurrence: FixedExpenseRecurrenceService,
  ) {}

  /** A entrada no app atualiza ciclos antes de avaliar avisos; erros permitem nova tentativa. */
  async synchronize(userId: string) {
    await this.recurrence.refreshRecurringExpenses(userId);
    return this.repository.synchronize(userId);
  }

  /**
   * Mutações forçam a avaliação mesmo dentro do intervalo de cinco minutos.
   * Uma falha auxiliar não transforma um pagamento já confirmado em falha financeira.
   */
  async processDueNotifications(userId: string, force = true) {
    try {
      return await this.repository.synchronize(userId, force);
    } catch {
      // Sem payload financeiro nos logs; o timestamp não foi confirmado no banco.
      this.logger.error(
        'Não foi possível atualizar os avisos de despesas fixas.',
      );
    }
  }
}
