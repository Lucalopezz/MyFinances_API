import { Injectable, Logger } from '@nestjs/common';
import { NotificationSyncService } from '../../notifications/services/notification-sync.service';

/** Integra mutações financeiras aos avisos sem propagar falhas auxiliares ao pagamento. */
@Injectable()
export class FixedExpenseNotificationService {
  private readonly logger = new Logger(FixedExpenseNotificationService.name);

  constructor(private readonly sync: NotificationSyncService) {}

  /** Mutações forçam a rodada; o timestamp só é confirmado quando toda avaliação termina. */
  async processDueNotifications(userId: string, force = true) {
    try {
      return await this.sync.evaluate(userId, force);
    } catch {
      // Sem payload financeiro nos logs; a próxima rodada pode recuperar a falha.
      this.logger.error(
        'Não foi possível atualizar os avisos de despesas fixas.',
      );
    }
  }
}
