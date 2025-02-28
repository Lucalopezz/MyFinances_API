import { forwardRef, Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { AppModule } from '../app/app.module';

@Module({
  controllers: [WishlistController],
  providers: [WishlistService],
  imports: [forwardRef(() => AppModule)],
  exports: [WishlistService],
})
export class WishlistModule {}
