import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FixedExpensesService } from '../fixed-expenses/fixed-expenses.service';
import { FixedExpensesRepository } from '../fixed-expenses/repositories/fixed-expenses.repository';
import { FixedExpensePaymentService } from '../fixed-expenses/services/fixed-expense-payment.service';
import { FixedExpenseRecurrenceService } from '../fixed-expenses/services/fixed-expense-recurrence.service';
import { FixedExpenseNotificationService } from '../fixed-expenses/services/fixed-expense-notification.service';
import { FixedExpenseRawFieldsService } from '../fixed-expenses/services/fixed-expense-raw-fields.service';
import { FixedExpenseErrorHandler } from '../fixed-expenses/errors/fixed-expense-error.handler';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    FixedExpensesService,
    FixedExpensesRepository,
    FixedExpensePaymentService,
    FixedExpenseRecurrenceService,
    FixedExpenseNotificationService,
    FixedExpenseRawFieldsService,
    FixedExpenseErrorHandler,
    FinancialDataEncryptionService,
  ],
  exports: [NotificationService],
  imports: [forwardRef(() => AppModule), AuthModule],
})
export class NotificationModule {}
