import { fromCents, toCents } from 'src/common/money/money';
import { reservedCents } from './wishlist-reservation';
import { WishlistMovementView } from '../types/wishlist.types';

/** Calcula progresso e sugestão inclusiva por mês a partir de uma data civil explícita. */
export function wishlistProgress(
  desiredValue: number,
  target: string | null,
  movements: WishlistMovementView[],
  today: string,
) {
  const reserved = reservedCents(movements);
  const remaining = Math.max(0, toCents(desiredValue) - reserved);
  let monthlySuggestion: number | null = null;
  let deadlineState: 'NONE' | 'ON_TRACK' | 'OVERDUE' | 'REACHED' = 'NONE';
  if (remaining === 0) deadlineState = 'REACHED';
  else if (target && target < today) deadlineState = 'OVERDUE';
  else if (target) {
    const [year, month] = target.split('-').map(Number);
    const [currentYear, currentMonth] = today.split('-').map(Number);
    const months = (year - currentYear) * 12 + month - currentMonth + 1;
    // Arredonda para cima em centavos para que os aportes mensais cubram a meta.
    monthlySuggestion = fromCents(Math.ceil(remaining / months));
    deadlineState = 'ON_TRACK';
  }
  return {
    reservedAmount: fromCents(reserved),
    remainingAmount: fromCents(remaining),
    progressPercent: Math.min(
      100,
      Math.round((reserved / toCents(desiredValue)) * 100),
    ),
    monthlySuggestion,
    deadlineState,
  };
}
