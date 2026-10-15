import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  controllers: [WishlistController],
  providers: [WishlistService],
  imports: [PrismaModule, EncryptionModule, AuthModule, CategoriesModule],
  exports: [WishlistService],
})
export class WishlistModule {}
