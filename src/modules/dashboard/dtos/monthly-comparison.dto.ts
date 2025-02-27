import { z } from 'zod';

export const MonthlyComparisonDto = z.object({
  month: z.string(), // ex: "2025-02" para fevereiro de 2025
  totalExpenses: z.number(),
  totalIncomes: z.number(),
  percentageChange: z.number().optional(),
});

export type MonthlyComparisonDto = z.infer<typeof MonthlyComparisonDto>;
