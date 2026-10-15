import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { CategoriesController } from './categories.controller';
import { CategoryRulesController } from './rules/category-rules.controller';
import { CategoryRulesService } from './rules/category-rules.service';

@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule],
  controllers: [CategoriesController, CategoryRulesController],
  providers: [CategoriesService, CategoriesRepository, CategoryRulesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
