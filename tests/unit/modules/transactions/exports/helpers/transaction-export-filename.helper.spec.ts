import { transactionExportFilename } from 'src/modules/transactions/exports/helpers/transaction-export-filename.helper';

describe('Nome público da exportação', () => {
  it('uses the report month and generation date in Brasília, including the UTC day boundary', () => {
    expect(
      transactionExportFilename('pdf', new Date('2026-10-14T01:00:00Z')),
    ).toBe('transacoes-outubro-2026-gerado-em-13-10-2026.pdf');
    expect(
      transactionExportFilename('xlsx', new Date('2026-10-13T15:00:00Z'), {
        startDate: new Date('2026-09-01T12:00:00Z'),
        endDate: new Date('2026-09-30T12:00:00Z'),
      }),
    ).toBe('transacoes-setembro-2026-gerado-em-13-10-2026.xlsx');
    expect(
      transactionExportFilename('csv', new Date('2026-10-13T15:00:00Z'), {
        startDate: new Date('2026-08-01T12:00:00Z'),
        endDate: new Date('2026-09-30T12:00:00Z'),
      }),
    ).toBe('transacoes-agosto-2026-a-setembro-2026-gerado-em-13-10-2026.csv');
  });
});
