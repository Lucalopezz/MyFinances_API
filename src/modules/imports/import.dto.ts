import { z } from 'zod';
import { CategoryReferenceSchema } from '../categories/category.dto';

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_TTL_MS = 24 * 60 * 60 * 1000;
const column = z.number().int().min(0).max(99);
export const ImportOptionsSchema = z
  .object({
    format: z.enum(['CSV', 'OFX']),
    encoding: z.enum(['utf-8', 'windows-1252']).default('utf-8'),
    source: z.string().trim().min(1).max(120),
    csv: z
      .object({
        delimiter: z.enum([',', ';', '\t']),
        dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']),
        decimalSeparator: z.enum([',', '.']),
        header: z.boolean().default(true),
        columns: z
          .object({
            date: column,
            description: column,
            value: column.optional(),
            income: column.optional(),
            expense: column.optional(),
            category: column.optional(),
            externalId: column.optional(),
            type: column.optional(),
          })
          .strict()
          .refine(
            (c) =>
              c.value !== undefined
                ? c.income === undefined && c.expense === undefined
                : c.income !== undefined && c.expense !== undefined,
            'Mapeie valor ou as duas colunas entrada/saída.',
          )
          .refine(
            (c) => new Set(Object.values(c)).size === Object.values(c).length,
            'Cada campo deve usar uma coluna diferente.',
          ),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => v.format !== 'CSV' || !!v.csv, 'Informe o mapeamento CSV.');

export const ConfirmImportSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            rowId: z.number().int().min(1).max(IMPORT_MAX_ROWS),
            selected: z.boolean(),
            category: CategoryReferenceSchema.optional(),
            allowDuplicate: z.boolean().default(false),
          })
          .strict(),
      )
      .max(IMPORT_MAX_ROWS)
      .refine(
        (rows) => new Set(rows.map((row) => row.rowId)).size === rows.length,
        'Linha repetida na confirmação.',
      ),
  })
  .strict();
export type ImportOptions = z.infer<typeof ImportOptionsSchema>;
export type ConfirmImport = z.infer<typeof ConfirmImportSchema>;

export type ImportRow = {
  rowId: number;
  date?: string;
  description?: string;
  value?: number;
  type?: 'INCOME' | 'EXPENSE';
  category?: string;
  externalId?: string;
  errors: string[];
};
export type ImportPayload = { source: string; rows: ImportRow[] };
export type DuplicateCandidate = {
  kind: 'FILE' | 'HISTORY';
  reason: 'EXTERNAL_ID' | 'FINGERPRINT';
  rowId?: number;
  transactionId?: string;
};
