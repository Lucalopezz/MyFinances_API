import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import {
  CompleteWishlistItemDto,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
  WishlistMovementDto,
} from './dtos/wishlist.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('wishlist')
@UseGuards(AuthTokenGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post()
  async createWishlistItem(
    @Body(new ZodValidationPipe(CreateWishlistItemDto))
    createWishlistItemDto: CreateWishlistItemDto,
    @User('sub') userId: string,
  ) {
    return this.wishlistService.createWishlistItem(
      createWishlistItemDto,
      userId,
    );
  }

  @Get()
  async getWishlistItems(@User('sub') userId: string) {
    return this.wishlistService.getWishlistItems(userId);
  }

  @Get('summary')
  async getSummary(@User('sub') userId: string) {
    return this.wishlistService.getSummary(userId);
  }

  @Post('settle-migration')
  async settleMigration(@User('sub') userId: string) {
    return this.wishlistService.settleMigration(userId);
  }

  @Post(':id/movements')
  async addMovement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WishlistMovementDto)) dto: WishlistMovementDto,
    @User('sub') userId: string,
  ) {
    return this.wishlistService.addMovement(id, dto, userId);
  }

  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CompleteWishlistItemDto))
    dto: CompleteWishlistItemDto,
    @User('sub') userId: string,
  ) {
    return this.wishlistService.complete(id, dto, userId);
  }

  @Get(':id')
  async getWishlistItem(@Param('id') id: string, @User('sub') userId: string) {
    return this.wishlistService.getWishlistItem(id, userId);
  }

  @Patch(':id')
  async updateWishlistItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWishlistItemDto))
    updateWishlistItemDto: UpdateWishlistItemDto,
    @User('sub') userId: string,
  ) {
    return this.wishlistService.updateWishlistItem(
      id,
      updateWishlistItemDto,
      userId,
    );
  }

  @Delete(':id')
  async deleteWishlistItem(
    @Param('id') id: string,
    @User('sub') userId: string,
  ) {
    return this.wishlistService.deleteWishlistItem(id, userId);
  }
}
