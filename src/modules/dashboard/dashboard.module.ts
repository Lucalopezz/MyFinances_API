import { DashboardMetrics } from './domain/dashboard-metrics';
import { CalendarModule } from '../calendar/calendar.module';
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardMetrics],
  imports: [AuthModule, TransactionsModule, CalendarModule],
})
export class DashboardModule {}
