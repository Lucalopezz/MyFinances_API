import { z } from 'zod';
import { CategoryReferenceSchema } from '../../categories/category.dto';

const money = z
  .number()
  .finite()
  .positive()
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    'Informe um valor em centavos.',
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    'Data inválida.',
  );

export const CreateWishlistItemDto = z.object({
  name: z.string().trim().min(1).max(120),
  desiredValue: money,
  targetDate: date.nullable().optional(),
});
export type CreateWishlistItemDto = z.infer<typeof CreateWishlistItemDto>;

export const UpdateWishlistItemDto = CreateWishlistItemDto.partial();
export type UpdateWishlistItemDto = z.infer<typeof UpdateWishlistItemDto>;

export const WishlistMovementDto = z.object({
  kind: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  value: money,
  date,
  note: z.string().trim().max(300).optional(),
});
export type WishlistMovementDto = z.infer<typeof WishlistMovementDto>;

export const CompleteWishlistItemDto = z.object({
  value: money,
  date,
  category: CategoryReferenceSchema,
  description: z.string().trim().min(1).max(300),
});
export type CompleteWishlistItemDto = z.infer<typeof CompleteWishlistItemDto>;
