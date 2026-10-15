export type WishlistMovementKind =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'CONSUMPTION'
  | 'RELEASE';

/** Dados já descriptografados consumidos pelos cálculos de reserva. */
export interface WishlistMovementView {
  id: string;
  kind: WishlistMovementKind;
  value: number;
  date: string;
  note: string | null;
  createdAt: Date;
}
