import { TransactionQueriesService } from 'src/modules/transactions/services/transaction-queries.service';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TransactionExportProcessor } from 'src/modules/transactions/exports/processors/transaction-export.processor';
import { TransactionCsvService } from 'src/modules/transactions/exports/generators/csv/transaction-csv.service';
import { TransactionPdfService } from 'src/modules/transactions/exports/generators/pdf/transaction-pdf.service';
import { TransactionXlsxService } from 'src/modules/transactions/exports/generators/xlsx/transaction-xlsx.service';
import { Workbook } from 'exceljs';
import { TRANSACTION_EXPORT_JOB } from 'src/modules/transactions/exports/constants/exports.constants';
import { TransactionExportReaderService } from 'src/modules/transactions/exports/services/transaction-export-reader.service';
import { TransactionExportWriterFactory } from 'src/modules/transactions/exports/services/transaction-export-writer.factory';
describe('TransactionExportProcessor', () => {
  it.each([
    { format: 'CSV', category: 'FOOD', label: 'Alimentação' },
    { format: 'PDF', category: 'FOOD', label: 'Alimentação' },
    { format: 'XLSX', category: 'FOOD', label: 'Alimentação' },
    {
      format: 'CSV',
      category: '64f000000000000000000070',
      label: 'Café especial',
    },
    {
      format: 'PDF',
      category: '64f000000000000000000070',
      label: 'Café especial',
    },
    {
      format: 'XLSX',
      category: '64f000000000000000000070',
      label: 'Café especial',
    },
  ])(
    'processes $format with category $category and user-scoped batches',
    async ({ format, category, label }) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'myfinances-export-test-'),
      );
      try {
        const exportId = '64f000000000000000000050';
        const userId = '64f000000000000000000001';
        const record = {
          id: '64f000000000000000000010',
          userId,
          type: 'EXPENSE',
          dateIndex: 20260706,
          createdAt: new Date(),
          updatedAt: new Date(),
          encryptedData: {
            value: JSON.stringify(12.5),
            date: JSON.stringify('2026-07-06T00:00:00.000Z'),
            category: JSON.stringify(category),
            description: JSON.stringify('Café, mercado'),
          },
        };
        // O segundo lote contém apenas um registro fora da categoria pedida.
        // Ele deve fazer o cursor avançar sem aparecer no arquivo nem alterar
        // os totais, protegendo a combinação de paginação e filtro local.
        const skippedRecord = {
          ...record,
          id: '64f000000000000000000011',
          encryptedData: {
            ...record.encryptedData,
            category: JSON.stringify('HOUSING'),
            description: JSON.stringify('Transação fora do filtro'),
            value: JSON.stringify(999),
          },
        };
        const findExportBatch = jest
          .fn()
          .mockResolvedValueOnce([record])
          .mockResolvedValueOnce([skippedRecord])
          .mockResolvedValueOnce([]);
        const repository = {
          findOwned: jest.fn(async () => ({
            id: exportId,
            userId,
            format,
            filters: { categoryId: category },
          })),
          markProcessing: jest.fn(async () => undefined),
          updateProgress: jest.fn(async () => undefined),
          markCompleted: jest.fn(async () => undefined),
          markFailed: jest.fn(async () => undefined),
        };
        const transactionsRepository = {
          countExportCandidates: jest.fn(async () => 2),
          findExportBatch,
        };
        const pdfService = new TransactionPdfService();
        const addPdfTransaction = jest.spyOn(pdfService, 'addTransaction');
        const createPdfDocument = jest.spyOn(pdfService, 'createDocument');
        const finalizePdfDocument = jest.spyOn(pdfService, 'finalizeDocument');
        const config = {
          get: (key: string, fallback: string) =>
            key === 'EXPORT_STORAGE_PATH' ? directory : fallback,
        };
        const processor = new TransactionExportProcessor(
          {
            resolveReference: jest.fn(async () => ({})),
            list: jest.fn(async () => [{ id: category, name: label }]),
          } as never,
          repository as never,
          config as never,
          new TransactionExportReaderService(
            new TransactionQueriesService(
              {} as never,
              transactionsRepository as never,
              { decrypt: (value: string) => JSON.parse(value) } as never,
            ),
            config as never,
          ),
          new TransactionExportWriterFactory(
            pdfService,
            new TransactionCsvService(),
            new TransactionXlsxService(),
          ),
        );
        const job = {
          name: TRANSACTION_EXPORT_JOB,
          data: { exportId, userId },
          updateProgress: jest.fn(async () => undefined),
        };
        await processor.process(job as never);

        const fileName = `${exportId}.${format.toLowerCase()}`;
        const content = await readFile(join(directory, fileName));
        if (format === 'CSV') {
          expect(content.toString('utf8')).toContain('"Café, mercado",12.5');
          expect(content.toString('utf8')).toContain(`"${category}"`);
          expect(content.toString('utf8')).not.toContain(
            'Transação fora do filtro',
          );
        } else if (format === 'XLSX') {
          // Lemos o arquivo produzido pelo worker, não apenas uma assinatura
          // ZIP: a categoria e as células precisam sobreviver à serialização.
          const workbook = new Workbook();
          await workbook.xlsx.readFile(join(directory, fileName));
          const sheet = workbook.getWorksheet('Transações');
          expect(sheet.rowCount).toBe(2);
          expect(sheet.getCell('A2').value).toEqual(
            new Date('2026-07-06T00:00:00.000Z'),
          );
          expect(sheet.getCell('B2').value).toBe('Café, mercado');
          expect(sheet.getCell('C2').value).toBe(label);
          expect(sheet.getCell('D2').value).toBe('Despesa');
          expect(sheet.getCell('E2').value).toBe(12.5);
        } else {
          expect(content.subarray(0, 4).toString()).toBe('%PDF');
          expect(addPdfTransaction).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ category }),
          );
          expect(createPdfDocument).toHaveBeenCalledWith(
            { categoryId: category },
            [{ id: category, name: label }],
          );
          expect(finalizePdfDocument).toHaveBeenCalledWith(expect.anything());
          expect(addPdfTransaction).toHaveBeenCalledTimes(1);
        }
        expect(findExportBatch).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ userId }),
          record.id,
          500,
        );
        expect(findExportBatch).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ userId }),
          skippedRecord.id,
          500,
        );
        expect(repository.findOwned).toHaveBeenCalledWith(exportId, userId);
        expect(
          transactionsRepository.countExportCandidates,
        ).toHaveBeenCalledWith({
          userId,
          startDate: undefined,
          endDate: undefined,
          type: undefined,
        });
        expect(repository.markCompleted).toHaveBeenCalledWith(
          exportId,
          userId,
          fileName,
        );
        expect(repository.markFailed).not.toHaveBeenCalled();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
