import { forwardRef, Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [WishlistController],
  providers: [WishlistService],
  imports: [forwardRef(() => AppModule), AuthModule],
  exports: [WishlistService],
})
export class WishlistModule {}
