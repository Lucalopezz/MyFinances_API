import { CategoriesService } from '../categories/categories.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionExportFormat } from '@prisma/client';
import { Job } from 'bullmq';
import { createWriteStream, WriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { finished } from 'stream/promises';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { decryptTransaction } from '../transactions/transaction-encryption.mapper';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import {
  TRANSACTION_EXPORT_JOB,
  TRANSACTION_EXPORT_QUEUE,
} from './exports.constants';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';
import { TransactionExportJob } from './transaction-export.types';
import { TransactionPdfService } from './transaction-pdf.service';
import { TransactionCsvService } from './transaction-csv.service';
import { TransactionExportsRepository } from './repositories/transaction-exports.repository';

// Register the processor for the transaction export queue with a concurrency of 1
@Processor(TRANSACTION_EXPORT_QUEUE, { concurrency: 1 })
@Injectable()
// Extends WorkerHost to handle job processing for transaction exports
// Need to implement the process method to handle the job logic
export class TransactionExportProcessor extends WorkerHost {
  private readonly logger = new Logger(TransactionExportProcessor.name);
  private readonly storagePath: string;
  private readonly batchSize: number;

  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionExportsRepository,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly configService: ConfigService,
    private readonly encryptionService: FinancialDataEncryptionService,
    private readonly pdfService: TransactionPdfService,
    private readonly csvService: TransactionCsvService,
  ) {
    super();
    this.storagePath = this.configService.get<string>(
      'EXPORT_STORAGE_PATH',
      './storage/exports',
    );
    this.batchSize = this.resolveBatchSize(
      this.configService.get<string>('TRANSACTION_EXPORT_BATCH_SIZE', '500'),
    );
  }

  async process(job: Job<TransactionExportJob>): Promise<void> {
    if (job.name !== TRANSACTION_EXPORT_JOB) {
      throw new Error(`Job de exportação desconhecido: ${job.name}`);
    }

    const { exportId, userId } = job.data;
    let filePath: string | undefined;
    let output: WriteStream | undefined;
    let outputFinished: Promise<void> | undefined;
    let document: PDFKit.PDFDocument | undefined;

    try {
      // Fetch the transaction export record from the database
      const transactionExport = await this.repository.findOwned(
        exportId,
        userId,
      );

      if (!transactionExport) {
        throw new Error('Exportação não encontrada para o job informado.');
      }

      const catalog = await this.categories.list(userId);
      const format = transactionExport.format ?? TransactionExportFormat.PDF;
      const fileName = `${exportId}.${format === TransactionExportFormat.CSV ? 'csv' : 'pdf'}`;
      filePath = join(this.storagePath, fileName);

      const filters = transactionExport.filters as
        | CreateTransactionExportDto
        | undefined;

      // Update the export record to indicate processing has started
      await this.repository.markProcessing(exportId, userId);

      // Ensure the storage directory exists before creating the output file.
      await mkdir(this.storagePath, { recursive: true });
      // Create a write stream for the PDF file and set up a promise to track when the stream finishes
      output = createWriteStream(filePath);
      // create a promise that resolves when the output stream finishes writing
      outputFinished = finished(output);
      // Ensure that if the output stream finishes with an error, we catch it to prevent unhandled promise rejections
      outputFinished.catch(() => undefined);
      if (format === TransactionExportFormat.CSV) {
        await this.csvService.writeHeader(output);
      } else {
        document = this.pdfService.createDocument(filters);
        document.pipe(output);
      }

      // Filter and process transactions in batches, decrypting them and adding them to the PDF document
      const candidates = {
        userId,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        type: filters?.type,
      };
      const total =
        await this.transactionsRepository.countExportCandidates(candidates);

      // Initialize variables to track the number of processed transactions and the cursor for pagination
      let processed = 0;
      let cursorId: string | undefined;

      while (true) {
        // Fetch a batch of transactions from the database based on the filters and cursor for pagination
        const transactions = await this.transactionsRepository.findExportBatch(
          candidates,
          cursorId,
          this.batchSize,
        );

        if (transactions.length === 0) {
          break;
        }
        // Decrypt each transaction and add it to the PDF document if it matches the specified filters
        for (const transaction of transactions) {
          const decrypted = decryptTransaction(
            transaction,
            this.encryptionService,
          );

          if (
            !filters?.categoryId ||
            decrypted.category === filters.categoryId
          ) {
            if (format === TransactionExportFormat.CSV) {
              await this.csvService.addTransaction(output, decrypted);
            } else {
              this.pdfService.addTransaction(document, {
                ...decrypted,
                category:
                  catalog.find((item) => item.id === decrypted.category)
                    ?.name ?? decrypted.category,
              });
            }
          }

          processed++;
        }

        cursorId = transactions[transactions.length - 1].id;
        const progress = total
          ? Math.min(99, Math.floor((processed / total) * 100))
          : 99;
        // Update the export record with the current progress and update the job's progress
        await this.repository.updateProgress(exportId, userId, progress);
        // Update the job's progress to reflect the current state of processing
        await job.updateProgress(progress);
      }

      if (document) document.end();
      else output.end();
      // Wait for the output stream to finish writing the PDF file before proceeding
      await outputFinished;
      // Update the export record to indicate that processing has completed successfully
      await this.repository.markCompleted(exportId, userId, fileName);
      await job.updateProgress(100);
    } catch (error) {
      document?.destroy();
      output?.destroy();
      await outputFinished?.catch(() => undefined);
      if (filePath) await unlink(filePath).catch(() => undefined);

      await this.repository
        .markFailed(exportId, userId)
        .catch((updateError) => {
          this.logger.error(
            `Falha ao atualizar a exportação ${exportId} como FAILED.`,
            updateError instanceof Error ? updateError.stack : undefined,
          );
        });

      this.logger.error(`Falha ao processar a exportação ${exportId}.`);
      throw error;
    }
  }

  private resolveBatchSize(value: string): number {
    const batchSize = Number(value);
    return Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 500;
  }
}
