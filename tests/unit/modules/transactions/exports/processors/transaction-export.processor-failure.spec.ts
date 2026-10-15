import { TransactionQueriesService } from 'src/modules/transactions/services/transaction-queries.service';
import { access, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TransactionExportProcessor } from 'src/modules/transactions/exports/processors/transaction-export.processor';
import { TransactionCsvService } from 'src/modules/transactions/exports/generators/csv/transaction-csv.service';
import { TransactionPdfService } from 'src/modules/transactions/exports/generators/pdf/transaction-pdf.service';
import { TransactionXlsxService } from 'src/modules/transactions/exports/generators/xlsx/transaction-xlsx.service';
import { TRANSACTION_EXPORT_JOB } from 'src/modules/transactions/exports/constants/exports.constants';
import { TransactionExportReaderService } from 'src/modules/transactions/exports/services/transaction-export-reader.service';
import { TransactionExportWriterFactory } from 'src/modules/transactions/exports/services/transaction-export-writer.factory';
describe('TransactionExportProcessor failure cleanup', () => {
  it.each(['description', 'disk'])(
    'fails an XLSX export safely after a %s error',
    async (failure) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'myfinances-xlsx-failure-'),
      );
      try {
        const exportId = '64f000000000000000000050';
        const userId = '64f000000000000000000001';
        const filePath = join(directory, `${exportId}.xlsx`);
        // Um diretório no destino provoca uma falha real do WriteStream. A
        // promessa de gravação precisa interromper a finalização do ZIP, sem
        // deixar o job travado nem anunciar COMPLETED para um arquivo inválido.
        if (failure === 'disk') await mkdir(filePath);
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
            description: JSON.stringify(
              failure === 'description' ? 'a'.repeat(32768) : 'Café',
            ),
          },
        };
        const repository = {
          findOwned: jest.fn(async () => ({ format: 'XLSX' })),
          markProcessing: jest.fn(async () => undefined),
          updateProgress: jest.fn(async () => undefined),
          markCompleted: jest.fn(async () => undefined),
          markFailed: jest.fn(async () => undefined),
        };
        const transactions = {
          countExportCandidates: async () => 1,
          findExportBatch: jest
            .fn()
            .mockResolvedValueOnce([record])
            .mockResolvedValueOnce([]),
        };
        const config = {
          get: (key: string, fallback: string) =>
            key === 'EXPORT_STORAGE_PATH' ? directory : fallback,
        };
        const processor = new TransactionExportProcessor(
          { list: async () => [] } as never,
          repository as never,
          config as never,
          new TransactionExportReaderService(
            new TransactionQueriesService(
              {} as never,
              transactions as never,
              { decrypt: (value: string) => JSON.parse(value) } as never,
            ),
            config as never,
          ),
          new TransactionExportWriterFactory(
            new TransactionPdfService(),
            new TransactionCsvService(),
            new TransactionXlsxService(),
          ),
        );
        await expect(
          processor.process({
            name: TRANSACTION_EXPORT_JOB,
            data: { exportId, userId },
            updateProgress: jest.fn(),
          } as never),
        ).rejects.toThrow(
          failure === 'description'
            ? 'limite de uma célula do Excel'
            : /EISDIR/,
        );
        expect(repository.markFailed).toHaveBeenCalledWith(exportId, userId);
        expect(repository.markCompleted).not.toHaveBeenCalled();
        if (failure === 'description')
          await expect(access(filePath)).rejects.toMatchObject({
            code: 'ENOENT',
          });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
