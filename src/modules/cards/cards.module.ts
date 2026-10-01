import { forwardRef, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { CategoriesModule } from '../categories/categories.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [forwardRef(() => AppModule), CategoriesModule],
  controllers: [CardsController],
  providers: [CardsService, FinancialDataEncryptionService],
  exports: [CardsService],
})
export class CardsModule {}
