import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WishlistItem } from '@prisma/client';
import { dayKey } from 'src/common/date/civil-date';
import { reservationSummary } from '../domain/wishlist-reservation';
import { wishlistProgress } from '../domain/wishlist-progress';
import { WishlistMapper } from '../mappers/wishlist.mapper';
import { WishlistRepository } from '../repositories/wishlist.repository';

/** Compõe respostas a partir de registros convertidos e cálculos puros do domínio. */
@Injectable()
export class WishlistQueriesService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly mapper: WishlistMapper,
  ) {}

  async findOwned(id: string, userId: string, tx?: Prisma.TransactionClient) {
    const item = await this.repository.findOwned(id, userId, tx);
    if (!item) throw new NotFoundException('Meta não encontrada.');
    return item;
  }

  async view(item: WishlistItem, tx?: Prisma.TransactionClient) {
    const movements = await this.repository.findMovements(
      item.userId,
      item.id,
      tx,
    );
    return this.compose(item, movements);
  }

  private compose(
    item: WishlistItem,
    records: Parameters<WishlistMapper['movement']>[0][],
  ) {
    const mapped = this.mapper.item(item);
    const movements = records.map((movement) => this.mapper.movement(movement));
    // Preserva a referência UTC utilizada anteriormente nos prazos da wishlist.
    return {
      ...mapped,
      ...wishlistProgress(
        item.desiredValue,
        mapped.targetDate,
        movements,
        dayKey(new Date()),
      ),
      movements,
    };
  }

  async summary(userId: string, tx?: Prisma.TransactionClient) {
    const { transactions, items, movements } =
      await this.repository.summaryRecords(userId, tx);
    return reservationSummary(
      this.mapper.transactions(transactions),
      items,
      movements.map((movement) => ({
        ...this.mapper.movement(movement),
        wishlistItemId: movement.wishlistItemId,
      })),
    );
  }

  async list(userId: string) {
    const [items, movements] = await Promise.all([
      this.repository.findItems(userId),
      this.repository.findMovements(userId),
    ]);
    return items.map((item) =>
      this.compose(
        item,
        movements.filter((movement) => movement.wishlistItemId === item.id),
      ),
    );
  }

  async get(id: string, userId: string) {
    return this.view(await this.findOwned(id, userId));
  }
}
