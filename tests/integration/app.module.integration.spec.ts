import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { TRANSACTION_EXPORT_QUEUE } from 'src/modules/transactions/exports/constants/exports.constants';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';
import { FixedExpensePaymentService } from 'src/modules/fixed-expenses/services/fixed-expense-payment.service';
import { ModulesContainer } from '@nestjs/core';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { FixedExpensesRepository } from 'src/modules/fixed-expenses/repositories/fixed-expenses.repository';
import { FixedExpenseRecurrenceService } from 'src/modules/fixed-expenses/services/fixed-expense-recurrence.service';
import { NotificationSyncService } from 'src/modules/notifications/services/notification-sync.service';
import { TransactionQueriesService } from 'src/modules/transactions/services/transaction-queries.service';
import { RecurringIncomesService } from 'src/modules/recurring-incomes/services/recurring-incomes.service';

// Os novos vínculos entre módulos precisam funcionar no Nest real, além dos
// testes de domínio que instanciam serviços diretamente. Banco e fila são
// substituídos para que esta verificação não abra conexões nem altere dados.
describe('Integração dos módulos financeiros', () => {
  it('resolves the dashboard projection and fixed-expense card payment dependencies', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(getQueueToken(TRANSACTION_EXPORT_QUEUE))
      .useValue({ close: async () => undefined })
      .compile();
    try {
      expect(module.get(DashboardService)).toBeDefined();
      expect(module.get(FixedExpensePaymentService)).toBeDefined();
      expect(module.get(TransactionQueriesService)).toBeDefined();
      expect(module.get(RecurringIncomesService)).toBeDefined();

      // Registrar providers compartilhados novamente criaria instâncias e
      // ciclos próprios; a composição real deve ter um único módulo proprietário.
      const modules = [...module.get(ModulesContainer).values()];
      for (const provider of [
        PrismaService,
        FinancialDataEncryptionService,
        FixedExpensesRepository,
        FixedExpenseRecurrenceService,
        NotificationSyncService,
      ]) {
        expect(
          modules.filter((entry) => entry.providers.has(provider)),
        ).toHaveLength(1);
      }
      const app = modules.find((entry) => entry.metatype === AppModule)!;
      // O wrapper do teste importa AppModule; os módulos da aplicação não podem
      // depender de volta da raiz para obter recursos compartilhados.
      expect([...app.imports].some((entry) => entry.imports.has(app))).toBe(
        false,
      );
    } finally {
      await module.close();
    }
  });
});
