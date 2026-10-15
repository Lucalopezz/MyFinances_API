import { TransactionExportFormat } from '@prisma/client';

// O worker e o download precisam concordar sobre extensão e tipo de arquivo.
// Centralizar os três formatos evita que um XLSX seja gravado ou servido como PDF.
export const TRANSACTION_EXPORT_FILE_TYPES: Record<
  TransactionExportFormat,
  { extension: string; contentType: string }
> = {
  PDF: { extension: 'pdf', contentType: 'application/pdf' },
  CSV: { extension: 'csv', contentType: 'text/csv; charset=utf-8' },
  XLSX: {
    extension: 'xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};
