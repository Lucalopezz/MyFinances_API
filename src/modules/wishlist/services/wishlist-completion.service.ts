import { ConflictException, Injectable } from '@nestjs/common';
import { CategoriesService } from '../../categories/categories.service';
import {
  completedAmounts,
  completionAmounts,
} from '../domain/wishlist-reservation';
import { CompleteWishlistItemDto } from '../dto/wishlist.dto';
import { WishlistMapper } from '../mappers/wishlist.mapper';
import { WishlistRepository } from '../repositories/wishlist.repository';
import { WishlistQueriesService } from './wishlist-queries.service';

/** Conclui a compra junto da despesa e do consumo/liberação, com recibo idempotente. */
@Injectable()
export class WishlistCompletionService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly queries: WishlistQueriesService,
    private readonly mapper: WishlistMapper,
    private readonly categories: CategoriesService,
  ) {}

  complete(id: string, dto: CompleteWishlistItemDto, userId: string) {
    return this.repository.atomic(userId, async (tx) => {
      const item = await this.queries.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') === 'COMPLETED') {
        const record = item.purchaseTransactionId
          ? await this.repository.findPurchase(
              item.purchaseTransactionId,
              userId,
              tx,
            )
          : null;
        if (!record)
          throw new ConflictException(
            'Compra concluída sem transação vinculada.',
          );
        const view = await this.queries.view(item, tx);
        const purchase = this.mapper.transaction(record);
        return {
          item: view,
          transaction: purchase,
          ...completedAmounts(view.movements, purchase.value),
          alreadyCompleted: true,
        };
      }
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('Meta indisponível para conclusão.');
      await this.categories.resolveReference(dto.category, userId, 'EXPENSE');
      const current = await this.queries.view(item, tx);
      const purchaseDate = new Date(`${dto.date}T00:00:00.000Z`);
      const transaction = await this.repository.createPurchase(
        this.mapper.purchaseData({
          value: dto.value,
          date: purchaseDate,
          category: dto.category,
          description: dto.description,
          type: 'EXPENSE',
          userId,
        }) as never,
        tx,
      );
      const amounts = completionAmounts(current.reservedAmount, dto.value);
      // O mesmo cliente transacional protege a despesa, os movimentos e o vínculo final.
      if (amounts.coveredAmount > 0)
        await this.repository.createMovement(
          {
            userId,
            wishlistItemId: id,
            kind: 'CONSUMPTION',
            encryptedData: this.mapper.movementData(
              amounts.coveredAmount,
              dto.date,
              'Reserva usada na compra',
            ),
          },
          tx,
        );
      if (amounts.releasedAmount > 0)
        await this.repository.createMovement(
          {
            userId,
            wishlistItemId: id,
            kind: 'RELEASE',
            encryptedData: this.mapper.movementData(
              amounts.releasedAmount,
              dto.date,
              'Sobra liberada após compra',
            ),
          },
          tx,
        );
      const completed = await this.repository.updateItem(
        id,
        userId,
        {
          status: 'COMPLETED',
          completedAt: purchaseDate,
          purchaseTransactionId: transaction.id,
        },
        tx,
      );
      return {
        item: await this.queries.view(completed, tx),
        transaction: this.mapper.transaction(transaction),
        ...amounts,
        alreadyCompleted: false,
      };
    });
  }
}
