import { z } from 'zod';

const dashboardDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data deve estar no formato YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, 'Data inválida')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const DashboardQuerySchema = z
  .object({
    startDate: dashboardDate,
    endDate: dashboardDate,
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'A data inicial deve ser anterior ou igual à data final.',
    path: ['endDate'],
  });

export type DashboardQueryDto = z.infer<typeof DashboardQuerySchema>;
