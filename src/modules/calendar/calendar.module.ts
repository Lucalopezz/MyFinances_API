import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './services/calendar.service';
import { CardsModule } from '../cards/cards.module';
@Module({
  imports: [
    PrismaModule,
    EncryptionModule,

    AuthModule,
    CategoriesModule,
    CardsModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
