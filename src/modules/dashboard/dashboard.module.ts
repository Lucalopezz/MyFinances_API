import { forwardRef, Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { DashboardRepository } from './repositories/dashboard.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardRepository,
    FinancialDataEncryptionService,
  ],
  imports: [forwardRef(() => AppModule), AuthModule, TransactionsModule],
})
export class DashboardModule {}
