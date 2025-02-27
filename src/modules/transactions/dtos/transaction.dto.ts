import { z } from 'zod';

export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

export const CreateTransactionDto = z.object({
  value: z.number(),
  date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Data inválida' })
    .transform((val) => new Date(val)),
  category: z.string(),
  description: z.string().optional(),
  type: TransactionTypeEnum,
  //   userId: z.string(), adicionar dps
});

export type CreateTransactionDto = z.infer<typeof CreateTransactionDto>;

export const UpdateTransactionDto = CreateTransactionDto.partial();
export type UpdateTransactionDto = z.infer<typeof UpdateTransactionDto>;
