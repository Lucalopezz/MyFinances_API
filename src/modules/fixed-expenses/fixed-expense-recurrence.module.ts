import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { FixedExpenseRecurrenceService } from './services/fixed-expense-recurrence.service';

/** Dona única da leitura/persistência e renovação de ciclos, sem depender de notificações. */
@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [FixedExpensesRepository, FixedExpenseRecurrenceService],
  exports: [FixedExpensesRepository, FixedExpenseRecurrenceService],
})
export class FixedExpenseRecurrenceModule {}
