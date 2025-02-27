import { z } from 'zod';

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
