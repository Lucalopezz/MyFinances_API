import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { RecurringIncomesModule } from '../recurring-incomes/recurring-incomes.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './services/calendar.service';
import { CalendarRepository } from './repositories/calendar.repository';
import { CalendarReceiptMapper } from './mappers/calendar-receipt.mapper';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    AuthModule,
    CardsModule,
    TransactionsModule,
    RecurringIncomesModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarRepository, CalendarReceiptMapper],
  exports: [CalendarService],
})
export class CalendarModule {}
