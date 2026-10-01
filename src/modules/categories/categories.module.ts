import { forwardRef, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './categories.repository';
import {
  CategoriesController,
  CategoryRulesController,
} from './categories.controller';

@Module({
  imports: [forwardRef(() => AppModule), AuthModule],
  controllers: [CategoriesController, CategoryRulesController],
  providers: [
    CategoriesService,
    CategoriesRepository,
    FinancialDataEncryptionService,
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}
