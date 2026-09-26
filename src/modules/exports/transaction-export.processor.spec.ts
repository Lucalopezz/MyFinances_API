import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TransactionExportProcessor } from './transaction-export.processor';
import { TransactionCsvService } from './transaction-csv.service';
import { TransactionPdfService } from './transaction-pdf.service';
import { TRANSACTION_EXPORT_JOB } from './exports.constants';

describe('TransactionExportProcessor', () => {
  it.each(['CSV', 'PDF'] as const)(
    'processes %s with the existing user-scoped batch flow',
    async (format) => {
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
            category: JSON.stringify('FOOD'),
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
            filters: null,
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
        const processor = new TransactionExportProcessor(
          repository as never,
          transactionsRepository as never,
          {
            get: (key: string, fallback: string) =>
              key === 'EXPORT_STORAGE_PATH' ? directory : fallback,
          } as never,
          { decrypt: (value: string) => JSON.parse(value) } as never,
          new TransactionPdfService(),
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
        } else {
          expect(content.subarray(0, 4).toString()).toBe('%PDF');
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
