import { ConflictException, Injectable } from '@nestjs/common';
import {
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from '../dto/wishlist.dto';
import { WishlistRepository } from '../repositories/wishlist.repository';
import { WishlistQueriesService } from './wishlist-queries.service';

/** Executa cadastro, edição e exclusão sem alterar reservas de compras concluídas. */
@Injectable()
export class WishlistItemsService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly queries: WishlistQueriesService,
  ) {}

  async create(dto: CreateWishlistItemDto, userId: string) {
    const item = await this.repository.createItem({
      name: dto.name,
      desiredValue: dto.desiredValue,
      targetDate: dto.targetDate
        ? new Date(`${dto.targetDate}T00:00:00.000Z`)
        : null,
      userId,
      savedAmount: 0,
      reservationMigrationState: 'SETTLED',
      status: 'ACTIVE',
    });
    return this.queries.view(item);
  }

  update(id: string, dto: UpdateWishlistItemDto, userId: string) {
    return this.repository.atomic(userId, async (tx) => {
      const item = await this.queries.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('A compra concluída não pode ser editada.');
      const updated = await this.repository.updateItem(
        id,
        userId,
        {
          ...dto,
          targetDate:
            dto.targetDate === undefined
              ? undefined
              : dto.targetDate
                ? new Date(`${dto.targetDate}T00:00:00.000Z`)
                : null,
        },
        tx,
      );
      return this.queries.view(updated, tx);
    });
  }

  delete(id: string, userId: string) {
    return this.repository.atomic(userId, async (tx) => {
      const item = await this.queries.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException(
          'Compra concluída deve permanecer no histórico.',
        );
      await this.repository.deleteItem(id, userId, tx);
      return { deleted: true };
    });
  }

  async settleMigration(userId: string) {
    await this.repository.settleMigration(userId);
    return this.queries.list(userId);
  }
}
