import { CategoryReferenceSchema } from '../../categories/category.dto';
import { z } from 'zod';

export const TransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
});

export type TransactionsQueryDto = z.infer<typeof TransactionsQuerySchema>;

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    'Data inválida.',
  );

export const TransactionSearchSchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional(),
    type: z.enum(['INCOME', 'EXPENSE']).optional(),
    category: CategoryReferenceSchema.optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    {
      message: 'A data inicial deve ser anterior ou igual à data final.',
      path: ['endDate'],
    },
  );

export type TransactionSearchDto = z.infer<typeof TransactionSearchSchema>;

export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

const transactionDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Data inválida.')
  .transform((value) => new Date(value));

const transactionFields = {
  value: z.number().finite(),
  date: transactionDate,
  category: CategoryReferenceSchema,
  description: z.string().optional(),
};

const IncomeTransactionSchema = z.object({
  type: z.literal('INCOME'),
  ...transactionFields,
});
const ExpenseTransactionSchema = z.object({
  type: z.literal('EXPENSE'),
  ...transactionFields,
});

export const CreateTransactionSchema = z.discriminatedUnion('type', [
  IncomeTransactionSchema,
  ExpenseTransactionSchema,
]);
export type CreateTransactionDto = z.infer<typeof CreateTransactionSchema>;

const IncomeUpdateSchema = IncomeTransactionSchema.partial().extend({
  type: z.literal('INCOME'),
});

const ExpenseUpdateSchema = ExpenseTransactionSchema.partial().extend({
  type: z.literal('EXPENSE'),
});

export const UpdateTransactionSchema = z.discriminatedUnion('type', [
  IncomeUpdateSchema,
  ExpenseUpdateSchema,
]);
export type UpdateTransactionDto = z.infer<typeof UpdateTransactionSchema>;
