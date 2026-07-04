import { forwardRef, Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

@Module({
  controllers: [WishlistController],
  providers: [WishlistService, FinancialDataEncryptionService],
  imports: [forwardRef(() => AppModule), AuthModule],
  exports: [WishlistService],
})
export class WishlistModule {}
