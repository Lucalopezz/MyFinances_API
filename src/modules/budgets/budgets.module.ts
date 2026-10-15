import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { MonthlyBudgetsRepository } from './repositories/monthly-budgets.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [PrismaModule, CategoriesModule, AuthModule, TransactionsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, MonthlyBudgetsRepository],
})
export class BudgetsModule {}
