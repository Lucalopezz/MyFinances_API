import { z } from 'zod';
import { CategoryReferenceSchema } from '../../categories/dto/category.dto';
import { todayKey } from 'src/common/date/civil-date';

export const RecurrenceTypeEnum = z.enum(['MONTHLY', 'YEARLY']);

export const CreateFixedExpenseDto = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  amount: z
    .number()
    .finite()
    .positive('Valor deve ser positivo')
    .max(999999999)
    .multipleOf(0.01),
  category: CategoryReferenceSchema,
  dueDate: z.coerce
    .date()
    .refine(
      (value) => value.toISOString().slice(0, 10) >= todayKey(),
      'Data não pode ser no passado',
    ),
  recurrence: RecurrenceTypeEnum,
  cardId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Selecione um cartão válido.')
    .nullable()
    .optional(),
  cardInstallments: z.number().int().min(1).max(60).optional(),
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
