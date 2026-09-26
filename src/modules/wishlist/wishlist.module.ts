import { forwardRef, Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { WishlistRepository } from './repositories/wishlist.repository';

@Module({
  controllers: [WishlistController],
  providers: [
    WishlistService,
    WishlistRepository,
    FinancialDataEncryptionService,
  ],
  imports: [forwardRef(() => AppModule), AuthModule],
  exports: [WishlistService],
})
export class WishlistModule {}
