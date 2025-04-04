import { forwardRef, Module } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesController } from './fixed-expenses.controller';
import { AppModule } from 'src/modules/app/app.module';
import { NotificationModule } from '../notification/notification.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [FixedExpensesController],
  providers: [FixedExpensesService],
  imports: [
    forwardRef(() => AppModule),
    NotificationModule,
    ScheduleModule.forRoot(),
    AuthModule,
  ],
})
export class FixedExpensesModule {}
