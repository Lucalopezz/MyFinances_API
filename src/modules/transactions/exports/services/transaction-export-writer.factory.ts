import { Injectable } from '@nestjs/common';
import { TransactionExportFormat } from '@prisma/client';
import { WriteStream } from 'fs';
import { CreateTransactionExportDto } from '../dto/create-transaction-export.dto';
import { TransactionCsvService } from '../generators/csv/transaction-csv.service';
import { TransactionPdfService } from '../generators/pdf/transaction-pdf.service';
import { TransactionXlsxService } from '../generators/xlsx/transaction-xlsx.service';
import { ExportCategoryCatalog } from '../helpers/transaction-export-formatting.helper';
import { TransactionExportWriter } from '../types/transaction-export-writer.types';

@Injectable()
export class TransactionExportWriterFactory {
  constructor(
    private readonly pdf: TransactionPdfService,
    private readonly csv: TransactionCsvService,
    private readonly xlsx: TransactionXlsxService,
  ) {}

  /**
   * Encapsula a escolha do formato e seu ciclo de escrita. O processador e o
   * leitor não precisam conhecer documentos PDF, planilhas ou cabeçalhos CSV.
   * Cada chamada cria um escritor próprio, ligado somente ao arquivo do job.
   */
  async create(
    format: TransactionExportFormat,
    output: WriteStream,
    filters?: CreateTransactionExportDto,
    catalog: ExportCategoryCatalog = [],
  ): Promise<TransactionExportWriter> {
    if (format === TransactionExportFormat.CSV) {
      await this.csv.writeHeader(output);
      return {
        addTransaction: (transaction) =>
          this.csv.addTransaction(output, transaction),
        finalize: () => {
          output.end();
        },
        abort: () => {
          output.destroy();
        },
      };
    }

    if (format === TransactionExportFormat.XLSX) {
      const document = this.xlsx.createDocument(output, catalog);
      return {
        addTransaction: (transaction) =>
          this.xlsx.addTransaction(document, transaction),
        finalize: () => this.xlsx.finalizeDocument(document),
        abort: () => this.xlsx.abortDocument(document),
      };
    }

    const document = this.pdf.createDocument(filters, catalog);
    document.pipe(output);
    return {
      addTransaction: (transaction) =>
        this.pdf.addTransaction(document, transaction),
      finalize: () => this.pdf.finalizeDocument(document),
      abort: () => {
        document.destroy();
      },
    };
  }
}
