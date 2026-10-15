import { fromCents, toCents } from 'src/common/money/money';
import { WishlistMovementKind } from '../types/wishlist.types';

type Movement = { kind: WishlistMovementKind; value: number };

/** Todo movimento posterior ao aporte reduz a reserva, inclusive consumo e liberação. */
export function reservedCents(movements: Movement[]) {
  return movements.reduce(
    (sum, movement) =>
      sum +
      (movement.kind === 'DEPOSIT'
        ? toCents(movement.value)
        : -toCents(movement.value)),
    0,
  );
}

/** Reservas só comprometem o saldo livre; nunca alteram o saldo financeiro registrado. */
export function reservationSummary(
  transactions: { type: string; value: number }[],
  items: { id: string; status?: string | null }[],
  movements: (Movement & { wishlistItemId: string })[],
) {
  const financial = transactions.reduce(
    (sum, transaction) =>
      sum +
      (transaction.type === 'INCOME'
        ? toCents(transaction.value)
        : -toCents(transaction.value)),
    0,
  );
  const activeIds = new Set(
    items
      .filter((item) => (item.status ?? 'ACTIVE') === 'ACTIVE')
      .map((item) => item.id),
  );
  const reserved = reservedCents(
    movements.filter((movement) => activeIds.has(movement.wishlistItemId)),
  );
  return {
    financialBalance: fromCents(financial),
    totalReserved: fromCents(reserved),
    freeBalance: fromCents(financial - reserved),
    insufficient: financial < reserved,
  };
}

/** Retorna a violação sem depender do transporte HTTP que apresentará a mensagem. */
export function movementViolation(
  kind: 'DEPOSIT' | 'WITHDRAWAL',
  value: number,
  reserved: number,
  free: number,
) {
  if (kind === 'WITHDRAWAL' && toCents(value) > toCents(reserved))
    return 'RESERVATION_EXCEEDED';
  if (kind === 'DEPOSIT' && toCents(value) > toCents(free))
    return 'INSUFFICIENT_FREE_BALANCE';
  return null;
}

/** A compra consome até seu valor e libera toda sobra no mesmo commit. */
export function completionAmounts(reserved: number, purchase: number) {
  const used = Math.min(toCents(reserved), toCents(purchase));
  return {
    coveredAmount: fromCents(used),
    releasedAmount: fromCents(toCents(reserved) - used),
    uncoveredAmount: fromCents(toCents(purchase) - used),
  };
}

/** O recibo de conclusão é reconstruído do histórico sem produzir novos lançamentos. */
export function completedAmounts(movements: Movement[], purchase: number) {
  const total = (kind: WishlistMovementKind) =>
    movements
      .filter((movement) => movement.kind === kind)
      .reduce((sum, movement) => sum + toCents(movement.value), 0);
  const covered = total('CONSUMPTION');
  return {
    coveredAmount: fromCents(covered),
    releasedAmount: fromCents(total('RELEASE')),
    uncoveredAmount: fromCents(toCents(purchase) - covered),
  };
}
