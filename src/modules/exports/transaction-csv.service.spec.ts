import { PassThrough } from 'stream';
import { WriteStream } from 'fs';
import { TransactionCsvService } from './transaction-csv.service';

describe('TransactionCsvService', () => {
  it('writes spreadsheet-compatible UTF-8 and escapes multiline descriptions', async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    const service = new TransactionCsvService();
    await service.writeHeader(output as unknown as WriteStream);
    await service.addTransaction(output as unknown as WriteStream, {
      id: '64f000000000000000000010',
      date: new Date('2026-07-06T00:00:00.000Z'),
      type: 'EXPENSE',
      category: 'FOOD',
      description: '=SOMA(1,2) "café"\nnovo',
      value: 12.5,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: '64f000000000000000000001',
    });
    output.end();
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toBe(
      '\uFEFFid,date,type,category,description,value\r\n' +
        '"64f000000000000000000010","2026-07-06T00:00:00.000Z","EXPENSE","FOOD","\'=SOMA(1,2) ""café""\nnovo",12.5\r\n',
    );
  });
});
