import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';
import {
  CategoriesController,
  CategoryRulesController,
} from './categories.controller';

@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule],
  controllers: [CategoriesController, CategoryRulesController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}
