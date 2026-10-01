import { z } from 'zod';
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= '2000-01-01' &&
      v <= '2100-12-31'
    );
  }, 'Data inválida.');
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
export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type IncomeInput = z.infer<typeof incomeSchema>;
export type IncomeRevision = IncomeInput & { effectiveFrom: string };
export type CalendarEvent = {
  id: string;
  sourceId: string;
  dueDate: string;
  description: string;
  amount: number;
  category: string;
  type: 'INCOME' | 'EXPENSE';
  status: 'PENDING' | 'OVERDUE' | 'SETTLED';
  periodKey?: string;
  actualDate?: string;
  actualAmount?: number;
  transactionId?: string;
};
