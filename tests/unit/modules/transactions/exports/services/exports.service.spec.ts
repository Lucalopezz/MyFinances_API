import { ExportsService } from 'src/modules/transactions/exports/services/exports.service';
import { TransactionExportsRepository } from 'src/modules/transactions/exports/repositories/transaction-exports.repository';
import { TRANSACTION_EXPORT_JOB } from 'src/modules/transactions/exports/constants/exports.constants';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CreateTransactionExportSchema } from 'src/modules/transactions/exports/dto/create-transaction-export.dto';

describe('ExportsService', () => {
  it('accepts all three formats and keeps PDF for older clients', () => {
    expect(CreateTransactionExportSchema.parse({}).format).toBe('PDF');
    for (const format of ['PDF', 'CSV', 'XLSX']) {
      expect(CreateTransactionExportSchema.parse({ format }).format).toBe(
        format,
      );
    }
    expect(
      CreateTransactionExportSchema.safeParse({ format: 'XLS' }).success,
    ).toBe(false);
  });

  it.each([
    ['PDF', 'pdf', 'application/pdf'],
    ['CSV', 'csv', 'text/csv; charset=utf-8'],
    [
      'XLSX',
      'xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  ])(
    'downloads %s with its correct extension and content type',
    async (format, extension, contentType) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'myfinances-download-test-'),
      );
      try {
        const id = '64f000000000000000000050';
        const userId = '64f000000000000000000001';
        const fileName = `${id}.${extension}`;
        await writeFile(join(directory, fileName), 'test');
        const findOwned = jest.fn(async () => ({
          status: 'COMPLETED',
          format,
          fileName,
          createdAt: new Date('2026-10-13T15:00:00Z'),
        }));
        const service = new ExportsService(
          {} as never,
          { findOwned } as never,
          { get: () => directory } as never,
          {} as never,
        );
        expect(await service.getDownload(id, userId)).toEqual({
          filePath: join(directory, fileName),
          fileName: `transacoes-outubro-2026-gerado-em-13-10-2026.${extension}`,
          contentType,
        });
        expect(findOwned).toHaveBeenCalledWith(id, userId);
        // Trocar a extensão no registro não pode servir um arquivo de outro
        // formato, ainda que o ID e o caminho pareçam pertencer ao mesmo usuário.
        findOwned.mockResolvedValue({
          status: 'COMPLETED',
          format,
          fileName: `${id}.invalid`,
          createdAt: new Date('2026-10-13T15:00:00Z'),
        });
        await expect(service.getDownload(id, userId)).rejects.toThrow(
          'Arquivo de exportação inválido.',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
  it.each(['PDF', 'CSV', 'XLSX'])(
    'persists %s and schedules the same user-scoped job',
    async (format) => {
      const userId = '64f000000000000000000001';
      const id = '64f000000000000000000050';
      const create = jest.fn(async ({ data }) => ({ id, ...data }));
      const add = jest.fn(async () => undefined);
      const service = new ExportsService(
        {
          resolveReference: jest.fn(async () => ({})),
          list: jest.fn(async () => []),
        } as never,
        new TransactionExportsRepository({
          transactionExport: { create },
        } as never),
        { get: (_key: string, fallback: string) => fallback } as never,
        { add } as never,
      );

      expect(
        await service.createTransactionExport(
          userId,
          CreateTransactionExportSchema.parse({ format }),
        ),
      ).toEqual({
        id,
        status: 'PENDING',
        progress: 0,
        format,
      });
      expect(create).toHaveBeenCalledWith({
        data: {
          userId,
          status: 'PENDING',
          progress: 0,
          format,
          filters: undefined,
        },
      });
      expect(add).toHaveBeenCalledWith(
        TRANSACTION_EXPORT_JOB,
        { exportId: id, userId },
        expect.objectContaining({ jobId: id }),
      );
    },
  );
});
