import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '../auth/auth.module';
import { FixedExpensesRepository } from '../fixed-expenses/repositories/fixed-expenses.repository';
import { FixedExpenseRecurrenceService } from '../fixed-expenses/services/fixed-expense-recurrence.service';
import { FixedExpenseNotificationService } from '../fixed-expenses/services/fixed-expense-notification.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationSyncRepository } from './repositories/notification-sync.repository';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationSyncRepository,
    FixedExpensesRepository,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
  ],
  exports: [NotificationsService, NotificationSyncRepository],
  imports: [PrismaModule, EncryptionModule, AuthModule],
})
export class NotificationsModule {}
