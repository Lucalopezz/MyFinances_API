import { Body, Controller, Post } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { CreateWishlistItemDto } from './dtos/wishlist.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post()
  async createWishlistItem(
    @Body(new ZodValidationPipe(CreateWishlistItemDto))
    createWishlistItemDto: CreateWishlistItemDto,
  ) {
    return this.wishlistService.createWishlistItem(createWishlistItemDto);
  }
}
