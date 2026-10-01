import { ExportsService } from './exports.service';
import { TransactionExportsRepository } from './repositories/transaction-exports.repository';
import { TRANSACTION_EXPORT_JOB } from './exports.constants';

describe('ExportsService', () => {
  it('persists PDF as the default client format and schedules the same user-scoped job', async () => {
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
      await service.createTransactionExport(userId, { format: 'PDF' }),
    ).toEqual({
      id,
      status: 'PENDING',
      progress: 0,
      format: 'PDF',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId,
        status: 'PENDING',
        progress: 0,
        format: 'PDF',
        filters: undefined,
      },
    });
    expect(add).toHaveBeenCalledWith(
      TRANSACTION_EXPORT_JOB,
      { exportId: id, userId },
      expect.objectContaining({ jobId: id }),
    );
  });
});
