import { z } from 'zod';

export const MonthlyComparisonMonthSchema = z.object({
  month: z.string(), // ex: "2025-02" para fevereiro de 2025
  totalExpenses: z.number(),
  totalIncomes: z.number(),
  balance: z.number(),
  economyRate: z.number(),
  percentageChange: z.number().optional(),
});

export const MonthlyComparisonHighlightSchema = z.object({
  month: z.string(),
  balance: z.number(),
  economyRate: z.number(),
});

export const MonthlyComparisonSchema = z.object({
  months: z.array(MonthlyComparisonMonthSchema),
  bestMonth: MonthlyComparisonHighlightSchema.nullable(),
  worstMonth: MonthlyComparisonHighlightSchema.nullable(),
});

export type MonthlyComparisonDto = z.infer<typeof MonthlyComparisonSchema>;
