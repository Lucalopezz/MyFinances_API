import { CalendarModule } from '../calendar/calendar.module';
import { CategoriesModule } from '../categories/categories.module';
import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { FixedExpensesModule } from 'src/modules/fixed-expenses/fixed-expenses.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExportsModule } from '../exports/exports.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { ImportsModule } from '../imports/imports.module';
import { CardsModule } from '../cards/cards.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    CalendarModule,
    CardsModule,
    ImportsModule,
    CategoriesModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = new URL(
          configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        );

        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username
              ? decodeURIComponent(redisUrl.username)
              : undefined,
            password: redisUrl.password
              ? decodeURIComponent(redisUrl.password)
              : undefined,
            db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1) || 0) : 0,
            tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
          },
        };
      },
    }),
    DashboardModule,
    TransactionsModule,
    WishlistModule,
    FixedExpensesModule,
    NotificationModule,
    AuthModule,
    UserModule,
    ExportsModule,
    BudgetsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
