import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FixedExpensesRepository } from '../fixed-expenses/repositories/fixed-expenses.repository';
import { FixedExpenseRecurrenceService } from '../fixed-expenses/services/fixed-expense-recurrence.service';
import { FixedExpenseNotificationService } from '../fixed-expenses/services/fixed-expense-notification.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationSyncRepository } from './repositories/notification-sync.repository';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationsRepository,
    NotificationSyncRepository,
    FixedExpensesRepository,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
    FinancialDataEncryptionService,
  ],
  exports: [NotificationService, NotificationSyncRepository],
  imports: [forwardRef(() => AppModule), AuthModule],
})
export class NotificationModule {}
