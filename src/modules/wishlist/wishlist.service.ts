import { Injectable } from '@nestjs/common';
import {
  CompleteWishlistItemDto,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
  WishlistMovementDto,
} from './dto/wishlist.dto';
import { WishlistCompletionService } from './services/wishlist-completion.service';
import { WishlistItemsService } from './services/wishlist-items.service';
import { WishlistQueriesService } from './services/wishlist-queries.service';
import { WishlistReservationsService } from './services/wishlist-reservations.service';

/** Mantém a entrada pública do módulo delegando cada operação ao serviço responsável. */
@Injectable()
export class WishlistService {
  constructor(
    private readonly queries: WishlistQueriesService,
    private readonly items: WishlistItemsService,
    private readonly reservations: WishlistReservationsService,
    private readonly completion: WishlistCompletionService,
  ) {}

  getSummary(userId: string) {
    return this.queries.summary(userId);
  }
  createWishlistItem(dto: CreateWishlistItemDto, userId: string) {
    return this.items.create(dto, userId);
  }
  getWishlistItems(userId: string) {
    return this.queries.list(userId);
  }
  getWishlistItem(id: string, userId: string) {
    return this.queries.get(id, userId);
  }
  updateWishlistItem(id: string, dto: UpdateWishlistItemDto, userId: string) {
    return this.items.update(id, dto, userId);
  }
  addMovement(id: string, dto: WishlistMovementDto, userId: string) {
    return this.reservations.addMovement(id, dto, userId);
  }
  settleMigration(userId: string) {
    return this.items.settleMigration(userId);
  }
  complete(id: string, dto: CompleteWishlistItemDto, userId: string) {
    return this.completion.complete(id, dto, userId);
  }
  deleteWishlistItem(id: string, userId: string) {
    return this.items.delete(id, userId);
  }
}
