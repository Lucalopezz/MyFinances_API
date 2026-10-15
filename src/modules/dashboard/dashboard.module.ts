import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { CalendarModule } from '../calendar/calendar.module';
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuthModule } from '../auth/auth.module';
import { DashboardRepository } from './repositories/dashboard.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
  imports: [
    PrismaModule,
    EncryptionModule,

    AuthModule,
    TransactionsModule,
    CalendarModule,
  ],
})
export class DashboardModule {}
