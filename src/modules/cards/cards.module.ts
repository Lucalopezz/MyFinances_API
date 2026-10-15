import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEncryptionMapper } from './mappers/card-encryption.mapper';
import { CardsRepository } from './repositories/cards.repository';
import { CardsCatalogService } from './services/cards-catalog.service';
import { CardPurchasesService } from './services/card-purchases.service';
import { CardInvoicesService } from './services/card-invoices.service';

@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule, CategoriesModule],
  controllers: [CardsController],
  providers: [
    CardsService,
    CardsRepository,
    CardEncryptionMapper,
    CardsCatalogService,
    CardPurchasesService,
    CardInvoicesService,
  ],
  exports: [CardsService],
})
export class CardsModule {}
