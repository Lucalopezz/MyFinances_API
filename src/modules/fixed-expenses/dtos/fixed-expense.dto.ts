import { z } from 'zod';
import { CategoryReferenceSchema } from '../../categories/category.dto';
import { todayKey } from '../../calendar/calendar-calculation';

export const RecurrenceTypeEnum = z.enum(['MONTHLY', 'YEARLY']);

export const CreateFixedExpenseDto = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  amount: z.number().positive('Valor deve ser positivo'),
  category: CategoryReferenceSchema,
  dueDate: z.coerce
    .date()
    .refine(
      (value) => value.toISOString().slice(0, 10) >= todayKey(),
      'Data não pode ser no passado',
    ),
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
