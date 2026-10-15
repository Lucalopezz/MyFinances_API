import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule, CategoriesModule],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
