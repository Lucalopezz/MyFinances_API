import { z } from 'zod';

export const RecurrenceTypeEnum = z.enum(['MONTHLY', 'YEARLY']);

export const CreateFixedExpenseDto = z.object({
  name: z.string(),
  amount: z.number(),
  dueDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Data inválida' })
    .transform((val) => new Date(val)),
  recurrence: RecurrenceTypeEnum,
  isPaid: z.boolean().optional().default(false),
});

export type CreateFixedExpenseDto = z.infer<typeof CreateFixedExpenseDto>;

export const UpdateFixedExpenseDto = CreateFixedExpenseDto.partial();
export type UpdateFixedExpenseDto = z.infer<typeof UpdateFixedExpenseDto>;
