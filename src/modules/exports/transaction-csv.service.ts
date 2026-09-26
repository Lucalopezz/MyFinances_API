import { Injectable } from '@nestjs/common';
import { once } from 'events';
import { WriteStream } from 'fs';
import { DecryptedTransaction } from '../transactions/transaction-encryption.mapper';

@Injectable()
export class TransactionCsvService {
  async writeHeader(output: WriteStream) {
    await this.write(
      output,
      '\uFEFFid,date,type,category,description,value\r\n',
    );
  }

  async addTransaction(output: WriteStream, transaction: DecryptedTransaction) {
    const cells = [
      transaction.id,
      transaction.date.toISOString(),
      transaction.type,
      transaction.category,
      transaction.description ?? '',
      String(transaction.value),
    ];
    await this.write(
      output,
      cells
        .map((value, index) =>
          index === 5 ? value : this.escapeCell(value, index === 4),
        )
        .join(',') + '\r\n',
    );
  }

  private escapeCell(value: string, protectFormula: boolean): string {
    const safe =
      protectFormula && /^[\s\u0000-\u001f]*[=+@-]/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }

  private async write(output: WriteStream, value: string) {
    if (!output.write(value)) await once(output, 'drain');
  }
}
