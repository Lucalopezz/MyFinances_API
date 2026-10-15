import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from './app.module';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { TRANSACTION_EXPORT_QUEUE } from './modules/transactions/exports/constants/exports.constants';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { FixedExpensePaymentService } from './modules/fixed-expenses/services/fixed-expense-payment.service';

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
    } finally {
      await module.close();
    }
  });
});
