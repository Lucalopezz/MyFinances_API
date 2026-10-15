import { z } from 'zod';
import { dateSchema } from 'src/common/date/civil-date.schema';

export const incomeSchema = z.object({
  description: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(999999999).multipleOf(0.01),
  category: z.string().min(1).max(100),
  startDate: dateSchema,
  recurrence: z.enum(['MONTHLY', 'YEARLY']),
  paused: z.boolean().default(false),
});
export const updateIncomeSchema = incomeSchema
  .partial()
  .extend({ revision: z.number().int().nonnegative() });
export const confirmationSchema = z.object({
  amount: incomeSchema.shape.amount,
  date: dateSchema,
});
