import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TransactionExportStatus,
  TransactionType,
} from '@prisma/client';
import { Job } from 'bullmq';
import { createWriteStream, WriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { finished } from 'stream/promises';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  decryptTransaction,
  EncryptedTransactionRecord,
  buildDateIndex,
} from '../transactions/transaction-encryption.mapper';
import {
  TRANSACTION_EXPORT_JOB,
  TRANSACTION_EXPORT_QUEUE,
} from './exports.constants';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';
import { TransactionExportJob } from './transaction-export.types';
import { TransactionPdfService } from './transaction-pdf.service';

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
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: FinancialDataEncryptionService,
    private readonly pdfService: TransactionPdfService,
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
    const fileName = `${exportId}.pdf`;
    const filePath = join(this.storagePath, fileName);
    let output: WriteStream | undefined;
    let outputFinished: Promise<void> | undefined;
    let document: PDFKit.PDFDocument | undefined;

    try {
      // Fetch the transaction export record from the database
      const transactionExport = await this.prisma.transactionExport.findFirst({
        where: { id: exportId, userId },
      });

      if (!transactionExport) {
        throw new Error('Exportação não encontrada para o job informado.');
      }

      const filters = transactionExport.filters as
        | CreateTransactionExportDto
        | undefined;

      // Update the export record to indicate processing has started
      await this.prisma.transactionExport.update({
        where: { id: exportId },
        data: {
          status: TransactionExportStatus.PROCESSING,
          progress: 0,
          errorMessage: null,
          completedAt: null,
          fileName: null,
        },
      });

      // Ensure the storage directory exists before creating the PDF file
      await mkdir(this.storagePath, { recursive: true });
      // Create a write stream for the PDF file and set up a promise to track when the stream finishes
      output = createWriteStream(filePath);
      // create a promise that resolves when the output stream finishes writing
      outputFinished = finished(output);
      // Ensure that if the output stream finishes with an error, we catch it to prevent unhandled promise rejections
      outputFinished.catch(() => undefined);
      // Create the PDF document using the TransactionPdfService and pipe it to the output stream
      document = this.pdfService.createDocument(filters);
      document.pipe(output);

      // Filter and process transactions in batches, decrypting them and adding them to the PDF document
      const where = this.buildTransactionWhere(userId, filters);
      const total = await this.prisma.transaction.count({ where });

      // Initialize variables to track the number of processed transactions and the cursor for pagination
      let processed = 0;
      let cursorId: string | undefined;

      while (true) {
        // Fetch a batch of transactions from the database based on the filters and cursor for pagination
        const transactions = await this.prisma.transaction.findMany({
          where,
          select: {
            id: true,
            encryptedData: true,
            type: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
          },
          orderBy: { id: 'asc' },
          take: this.batchSize,
          // If a cursorId is set, use it to fetch the next batch of transactions
          // after the last processed transaction
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        });

        if (transactions.length === 0) {
          break;
        }
        // Decrypt each transaction and add it to the PDF document if it matches the specified filters
        for (const transaction of transactions) {
          const decrypted = decryptTransaction(
            transaction as unknown as EncryptedTransactionRecord,
            this.encryptionService,
          );

          if (
            !filters?.categoryId ||
            decrypted.category === filters.categoryId
          ) {
            this.pdfService.addTransaction(document, decrypted);
          }

          processed++;
        }

        cursorId = transactions[transactions.length - 1].id;
        const progress = total
          ? Math.min(99, Math.floor((processed / total) * 100))
          : 99;
        // Update the export record with the current progress and update the job's progress
        await this.prisma.transactionExport.update({
          where: { id: exportId },
          data: { progress },
        });
        // Update the job's progress to reflect the current state of processing
        await job.updateProgress(progress);
      }

      document.end();
      // Wait for the output stream to finish writing the PDF file before proceeding
      await outputFinished;
      // Update the export record to indicate that processing has completed successfully
      await this.prisma.transactionExport.update({
        where: { id: exportId },
        data: {
          status: TransactionExportStatus.COMPLETED,
          progress: 100,
          fileName,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
      await job.updateProgress(100);
    } catch (error) {
      document?.destroy();
      output?.destroy();
      await outputFinished?.catch(() => undefined);
      await unlink(filePath).catch(() => undefined);

      await this.prisma.transactionExport
        .updateMany({
          where: { id: exportId, userId },
          data: {
            status: TransactionExportStatus.FAILED,
            errorMessage: 'Não foi possível gerar o PDF da exportação.',
            fileName: null,
            completedAt: null,
          },
        })
        .catch((updateError) => {
          this.logger.error(
            `Falha ao atualizar a exportação ${exportId} como FAILED.`,
            updateError instanceof Error ? updateError.stack : undefined,
          );
        });

      this.logger.error(
        `Falha ao processar a exportação ${exportId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private buildTransactionWhere(
    userId: string,
    filters?: CreateTransactionExportDto,
  ): Prisma.TransactionWhereInput {
    // Build the date index for filtering transactions based on the provided start and end dates
    const startDateIndex = filters?.startDate
      ? buildDateIndex(filters.startDate)
      : undefined;
    const endDateIndex = filters?.endDate
      ? buildDateIndex(filters.endDate)
      : undefined;

    // Return the constructed where clause for querying transactions based on user ID, type, and date index
    return {
      userId,
      type: filters?.type as TransactionType | undefined,
      dateIndex:
        startDateIndex !== undefined || endDateIndex !== undefined
          ? { gte: startDateIndex, lte: endDateIndex }
          : undefined,
    };
  }

  private resolveBatchSize(value: string): number {
    const batchSize = Number(value);
    return Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 500;
  }
}
