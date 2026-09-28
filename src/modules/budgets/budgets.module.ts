import { CategoriesModule } from '../categories/categories.module';
import { forwardRef, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { MonthlyBudgetsRepository } from './repositories/monthly-budgets.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    CategoriesModule,
    forwardRef(() => AppModule),
    AuthModule,
    TransactionsModule,
  ],
  controllers: [BudgetsController],
  providers: [
    BudgetsService,
    MonthlyBudgetsRepository,
    FinancialDataEncryptionService,
  ],
})
export class BudgetsModule {}
