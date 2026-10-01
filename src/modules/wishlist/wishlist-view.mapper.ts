import { WishlistItem, WishlistMovement } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

type MovementKind = 'DEPOSIT' | 'WITHDRAWAL' | 'CONSUMPTION' | 'RELEASE';

export const cents = (value: number) => Math.round(value * 100);
export const amount = (value: number) => value / 100;

export function movementView(
  movement: WishlistMovement,
  encryption: FinancialDataEncryptionService,
) {
  const data = movement.encryptedData as {
    value: string;
    date: string;
    note: string;
  };
  return {
    id: movement.id,
    kind: movement.kind as MovementKind,
    value: encryption.decrypt<number>(data.value),
    date: encryption.decrypt<string>(data.date),
    note: encryption.decrypt<string | null>(data.note),
    createdAt: movement.createdAt,
  };
}

export function itemView(
  item: WishlistItem,
  movements: WishlistMovement[],
  encryption: FinancialDataEncryptionService,
) {
  const history = movements.map((movement) =>
    movementView(movement, encryption),
  );
  const reservedCents = history.reduce(
    (total, movement) =>
      total +
      (movement.kind === 'DEPOSIT'
        ? cents(movement.value)
        : -cents(movement.value)),
    0,
  );
  const reserved = amount(reservedCents);
  const remainingCents = Math.max(0, cents(item.desiredValue) - reservedCents);
  const target = item.targetDate?.toISOString().slice(0, 10) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  let monthlySuggestion: number | null = null;
  let deadlineState: 'NONE' | 'ON_TRACK' | 'OVERDUE' | 'REACHED' = 'NONE';
  if (remainingCents === 0) deadlineState = 'REACHED';
  else if (target && target < today) deadlineState = 'OVERDUE';
  else if (target) {
    const [year, month] = target.split('-').map(Number);
    const [currentYear, currentMonth] = today.split('-').map(Number);
    const months = (year - currentYear) * 12 + month - currentMonth + 1;
    monthlySuggestion = amount(Math.ceil(remainingCents / months));
    deadlineState = 'ON_TRACK';
  }
  return {
    id: item.id,
    name: item.name,
    desiredValue: item.desiredValue,
    targetDate: target,
    reservedAmount: reserved,
    remainingAmount: amount(remainingCents),
    progressPercent: Math.min(
      100,
      Math.round((reservedCents / cents(item.desiredValue)) * 100),
    ),
    monthlySuggestion,
    deadlineState,
    legacySavedAmount: item.savedAmount,
    reservationMigrationState: item.reservationMigrationState ?? 'PENDING',
    status: item.status ?? 'ACTIVE',
    completedAt: item.completedAt,
    purchaseTransactionId: item.purchaseTransactionId,
    movements: history,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
