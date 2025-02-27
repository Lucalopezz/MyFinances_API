import { z } from 'zod';

export const MonthlyComparisonSchema = z.object({
  month: z.string(), // ex: "2025-02" para fevereiro de 2025
  totalExpenses: z.number(),
  totalIncomes: z.number(),
  percentageChange: z.number().optional(),
});

export type MonthlyComparisonDto = z.infer<typeof MonthlyComparisonSchema>;

export const DashboardQuerySchema = z.object({
  startDate: z
    .string({
      required_error: 'A data inicial é obrigatória',
      invalid_type_error: 'A data inicial deve ser uma string',
    })
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'A data inicial deve estar no formato YYYY-MM-DD',
    )
    .transform((val) => new Date(val)),

  endDate: z
    .string({
      required_error: 'A data final é obrigatória',
      invalid_type_error: 'A data final deve ser uma string',
    })
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'A data final deve estar no formato YYYY-MM-DD',
    )
    .transform((val) => new Date(val)),
});

export type DashboardQueryDto = z.infer<typeof DashboardQuerySchema>;
