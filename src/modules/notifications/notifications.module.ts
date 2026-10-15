import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '../auth/auth.module';
import { FixedExpenseRecurrenceModule } from '../fixed-expenses/fixed-expense-recurrence.module';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationSyncRepository } from './repositories/notification-sync.repository';
import { NotificationSyncService } from './services/notification-sync.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationSyncRepository,
    NotificationSyncService,
  ],
  exports: [NotificationsService, NotificationSyncService],
  imports: [PrismaModule, AuthModule, FixedExpenseRecurrenceModule],
})
export class NotificationsModule {}
