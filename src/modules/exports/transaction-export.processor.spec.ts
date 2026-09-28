import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TransactionExportProcessor } from './transaction-export.processor';
import { TransactionCsvService } from './transaction-csv.service';
import { TransactionPdfService } from './transaction-pdf.service';
import { TRANSACTION_EXPORT_JOB } from './exports.constants';

describe('TransactionExportProcessor', () => {
  it.each([
    { format: 'CSV', category: 'FOOD', label: 'Alimentação' },
    { format: 'PDF', category: 'FOOD', label: 'Alimentação' },
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
        const findExportBatch = jest
          .fn()
          .mockResolvedValueOnce([record])
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
          countExportCandidates: jest.fn(async () => 1),
          findExportBatch,
        };
        const pdfService = new TransactionPdfService();
        const addPdfTransaction = jest.spyOn(pdfService, 'addTransaction');
        const processor = new TransactionExportProcessor(
          {
            resolveReference: jest.fn(async () => ({})),
            list: jest.fn(async () => [{ id: category, name: label }]),
          } as never,
          repository as never,
          transactionsRepository as never,
          {
            get: (key: string, fallback: string) =>
              key === 'EXPORT_STORAGE_PATH' ? directory : fallback,
          } as never,
          { decrypt: (value: string) => JSON.parse(value) } as never,
          pdfService,
          new TransactionCsvService(),
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
        } else {
          expect(content.subarray(0, 4).toString()).toBe('%PDF');
          expect(addPdfTransaction).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ category: label }),
          );
        }
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
