import { z } from 'zod';

export const RecurrenceTypeEnum = z.enum(['MONTHLY', 'YEARLY']);

export const CreateFixedExpenseDto = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  amount: z.number().positive('Valor deve ser positivo'),
  dueDate: z.coerce
    .date()
    .min(new Date(), 'Data não pode ser no passado')
    .transform((val) => val),
  recurrence: RecurrenceTypeEnum,
});

export type CreateFixedExpenseDto = z.infer<typeof CreateFixedExpenseDto>;

export const UpdateFixedExpenseDto = CreateFixedExpenseDto.partial();
export type UpdateFixedExpenseDto = z.infer<typeof UpdateFixedExpenseDto>;

export const UpdateFixedExpensePaymentDto = z.object({
  isPaid: z.boolean(),
});
export type UpdateFixedExpensePaymentDto = z.infer<
  typeof UpdateFixedExpensePaymentDto
>;
