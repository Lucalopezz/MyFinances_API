import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { movementViolation } from '../domain/wishlist-reservation';
import { WishlistMovementDto } from '../dto/wishlist.dto';
import { WishlistMapper } from '../mappers/wishlist.mapper';
import { WishlistRepository } from '../repositories/wishlist.repository';
import { WishlistQueriesService } from './wishlist-queries.service';

/** Valida aportes e retiradas usando a mesma leitura protegida pela trava do usuário. */
@Injectable()
export class WishlistReservationsService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly queries: WishlistQueriesService,
    private readonly mapper: WishlistMapper,
  ) {}

  /** Registra aporte/retirada no histórico da meta, sem criar receita ou despesa financeira. */
  addMovement(id: string, dto: WishlistMovementDto, userId: string) {
    // atomic serializa movimentos pelo usuário, inclusive entre metas diferentes.
    // Todas as leituras abaixo usam o mesmo tx para dois aportes não gastarem o mesmo saldo livre.
    return this.repository.atomic(userId, async (tx) => {
      const item = await this.queries.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('Meta já concluída.');
      const current = await this.queries.view(item, tx);
      // Aporte depende do saldo financeiro menos todas as reservas ativas.
      // Retirada depende só da reserva desta meta e pode liberar dinheiro mesmo com saldo livre negativo.
      const free =
        dto.kind === 'DEPOSIT'
          ? (await this.queries.summary(userId, tx)).freeBalance
          : 0;
      const violation = movementViolation(
        dto.kind,
        dto.value,
        current.reservedAmount,
        free,
      );
      if (violation === 'RESERVATION_EXCEEDED')
        throw new BadRequestException('Retirada maior que a reserva da meta.');
      if (violation === 'INSUFFICIENT_FREE_BALANCE')
        throw new BadRequestException(
          'Saldo livre insuficiente para este aporte.',
        );
      await this.repository.createMovement(
        {
          userId,
          wishlistItemId: id,
          kind: dto.kind,
          encryptedData: this.mapper.movementData(
            dto.value,
            dto.date,
            dto.note,
          ),
        },
        tx,
      );
      // Recalcula dentro da mesma transação para devolver a reserva já com o movimento salvo.
      return this.queries.view(item, tx);
    });
  }
}
