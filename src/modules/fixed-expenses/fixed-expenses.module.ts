import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { CardsModule } from '../cards/cards.module';
import { CategoriesModule } from '../categories/categories.module';
import { Module } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesController } from './fixed-expenses.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { FixedExpenseErrorHandler } from './errors/fixed-expense-error.handler';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { FixedExpenseNotificationService } from './services/fixed-expense-notification.service';
import { FixedExpensePaymentService } from './services/fixed-expense-payment.service';
import { FixedExpenseRawFieldsService } from './services/fixed-expense-raw-fields.service';
import { FixedExpenseRecurrenceService } from './services/fixed-expense-recurrence.service';
import { FixedExpensePaymentsRepository } from './repositories/fixed-expense-payments.repository';

@Module({
  controllers: [FixedExpensesController],
  providers: [
    FixedExpensesService,
    FixedExpensesRepository,
    FixedExpensePaymentsRepository,
    FixedExpensePaymentService,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
    FixedExpenseRawFieldsService,
    FixedExpenseErrorHandler,
  ],
  exports: [
    FixedExpensesService,
    FixedExpensesRepository,
    FixedExpensePaymentService,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
    FixedExpenseRawFieldsService,
    FixedExpenseErrorHandler,
  ],
  imports: [
    PrismaModule,
    EncryptionModule,
    CategoriesModule,
    CardsModule,

    NotificationsModule,
    AuthModule,
  ],
})
export class FixedExpensesModule {}
