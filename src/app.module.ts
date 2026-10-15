import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { Module } from '@nestjs/common';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { FixedExpensesModule } from 'src/modules/fixed-expenses/fixed-expenses.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExportsModule } from './modules/transactions/exports/exports.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { ImportsModule } from './modules/transactions/imports/imports.module';
import { CardsModule } from './modules/cards/cards.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule,
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
    NotificationsModule,
    AuthModule,
    UsersModule,
    ExportsModule,
    BudgetsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
