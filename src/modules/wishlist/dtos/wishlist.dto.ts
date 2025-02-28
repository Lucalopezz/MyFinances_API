import { z } from 'zod';

export const CreateWishlistItemDto = z.object({
  name: z.string(),
  desiredValue: z.number(),
  savedAmount: z.number().optional().default(0),
  targetDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Data inválida',
    })
    .transform((val) => (val ? new Date(val) : undefined)),
});

export type CreateWishlistItemDto = z.infer<typeof CreateWishlistItemDto>;

export const UpdateWishlistItemDto = CreateWishlistItemDto.partial();
export type UpdateWishlistItemDto = z.infer<typeof UpdateWishlistItemDto>;
