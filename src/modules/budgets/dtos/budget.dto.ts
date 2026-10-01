import { z } from 'zod';
import { CategoryReferenceSchema } from '../../categories/category.dto';

export const MonthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês deve estar no formato YYYY-MM.');
export const BudgetMonthQuerySchema = z.object({ month: MonthKeySchema });
export type BudgetMonthQueryDto = z.infer<typeof BudgetMonthQuerySchema>;

const budgetFields = z.object({
  monthKey: MonthKeySchema,
  category: CategoryReferenceSchema,
  limitAmount: z.number().finite().positive(),
});
export const CreateBudgetSchema = budgetFields;
export const UpdateBudgetSchema = budgetFields
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe pelo menos um campo para atualizar.',
  );
export type CreateBudgetDto = z.infer<typeof CreateBudgetSchema>;
export type UpdateBudgetDto = z.infer<typeof UpdateBudgetSchema>;
