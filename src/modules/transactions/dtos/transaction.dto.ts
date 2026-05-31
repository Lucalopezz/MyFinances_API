import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from 'src/common/constants/categories.constants';
import { z } from 'zod';

export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

const IncomeTransactionSchema = z.object({
  type: z.literal('INCOME'),
  value: z.number(),
  date: z.string().transform((v) => new Date(v)),
  category: z.enum(INCOME_CATEGORIES),
  description: z.string().optional(),
});
const ExpenseTransactionSchema = z.object({
  type: z.literal('EXPENSE'),
  value: z.number(),
  date: z.string().transform((v) => new Date(v)),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().optional(),
});

// Merge the two schemas into a discriminated union based on the 'type' field
export const CreateTransactionSchema = z.discriminatedUnion('type', [
  IncomeTransactionSchema,
  ExpenseTransactionSchema,
]);
export type CreateTransactionDto = z.infer<typeof CreateTransactionSchema>;

// For updates, all fields are optional, but we still want to enforce the type-specific category constraints
const IncomeUpdateSchema = IncomeTransactionSchema.partial().extend({
  type: z.literal('INCOME'),
});

const ExpenseUpdateSchema = ExpenseTransactionSchema.partial().extend({
  type: z.literal('EXPENSE'),
});

// Merge the two update schemas into a discriminated union based on the 'type' field
export const UpdateTransactionSchema = z.discriminatedUnion('type', [
  IncomeUpdateSchema,
  ExpenseUpdateSchema,
]);
export type UpdateTransactionDto = z.infer<typeof UpdateTransactionSchema>;
