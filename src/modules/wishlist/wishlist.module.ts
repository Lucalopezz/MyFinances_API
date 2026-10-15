import { WishlistMapper } from './mappers/wishlist.mapper';
import { WishlistRepository } from './repositories/wishlist.repository';
import { WishlistCompletionService } from './services/wishlist-completion.service';
import { WishlistItemsService } from './services/wishlist-items.service';
import { WishlistQueriesService } from './services/wishlist-queries.service';
import { WishlistReservationsService } from './services/wishlist-reservations.service';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  controllers: [WishlistController],
  providers: [
    WishlistService,
    WishlistMapper,
    WishlistRepository,
    WishlistCompletionService,
    WishlistItemsService,
    WishlistQueriesService,
    WishlistReservationsService,
  ],
  imports: [PrismaModule, EncryptionModule, AuthModule, CategoriesModule],
  exports: [WishlistService],
})
export class WishlistModule {}
