import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { FixedExpensesModule } from 'src/modules/fixed-expenses/fixed-expenses.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    DashboardModule,
    TransactionsModule,
    WishlistModule,
    FixedExpensesModule,
    ScheduleModule.forRoot(),
    NotificationModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
