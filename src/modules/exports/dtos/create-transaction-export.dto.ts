import { z } from 'zod';

export const CreateTransactionExportSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    categoryId: z.string().trim().min(1).optional(),
    type: z.enum(['INCOME', 'EXPENSE']).optional(),
  })
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    {
      message: 'A data inicial deve ser anterior ou igual à data final.',
      path: ['endDate'],
    },
  );

export type CreateTransactionExportDto = z.infer<
  typeof CreateTransactionExportSchema
>;
