import { forwardRef, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CardsModule } from '../cards/cards.module';
@Module({
  imports: [
    forwardRef(() => AppModule),
    AuthModule,
    CategoriesModule,
    CardsModule,
  ],
  controllers: [CalendarController],
  providers: [FinancialDataEncryptionService, CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
