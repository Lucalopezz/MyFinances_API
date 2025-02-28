import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import {
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from './dtos/wishlist.dto';
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

  @Get()
  async getWishlistItems() {
    return this.wishlistService.getWishlistItems();
  }

  @Get(':id')
  async getWishlistItem(@Param('id') id: string) {
    return this.wishlistService.getWishlistItem(id);
  }

  @Patch(':id')
  async updateWishlistItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWishlistItemDto))
    updateWishlistItemDto: UpdateWishlistItemDto,
  ) {
    return this.wishlistService.updateWishlistItem(id, updateWishlistItemDto);
  }

  @Delete(':id')
  async deleteWishlistItem(@Param('id') id: string) {
    return this.wishlistService.deleteWishlistItem(id);
  }
}
