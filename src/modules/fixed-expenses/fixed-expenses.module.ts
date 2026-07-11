import { forwardRef, Module } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesController } from './fixed-expenses.controller';
import { AppModule } from 'src/modules/app/app.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { FixedExpenseErrorHandler } from './errors/fixed-expense-error.handler';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { FixedExpenseNotificationService } from './services/fixed-expense-notification.service';
import { FixedExpensePaymentService } from './services/fixed-expense-payment.service';
import { FixedExpenseRawFieldsService } from './services/fixed-expense-raw-fields.service';
import { FixedExpenseRecurrenceService } from './services/fixed-expense-recurrence.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

@Module({
  controllers: [FixedExpensesController],
  providers: [
    FixedExpensesService,
    FixedExpensesRepository,
    FixedExpensePaymentService,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
    FixedExpenseRawFieldsService,
    FixedExpenseErrorHandler,
    FinancialDataEncryptionService,
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
  imports: [forwardRef(() => AppModule), NotificationModule, AuthModule],
})
export class FixedExpensesModule {}
