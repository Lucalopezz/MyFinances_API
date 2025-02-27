import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [DashboardModule, TransactionsModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
