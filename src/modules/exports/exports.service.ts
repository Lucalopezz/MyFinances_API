import { CategoriesService } from '../categories/categories.service';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TransactionExportFormat,
  TransactionExportStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { constants } from 'fs';
import { access } from 'fs/promises';
import { join } from 'path';
import {
  TRANSACTION_EXPORT_JOB,
  TRANSACTION_EXPORT_QUEUE,
} from './exports.constants';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';
import { TransactionExportJob } from './transaction-export.types';
import { TransactionExportsRepository } from './repositories/transaction-exports.repository';

@Injectable()
export class ExportsService {
  private readonly storagePath: string;

  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionExportsRepository,
    private readonly configService: ConfigService,
    @InjectQueue(TRANSACTION_EXPORT_QUEUE)
    private readonly exportQueue: Queue<TransactionExportJob>,
  ) {
    this.storagePath = this.configService.get<string>(
      'EXPORT_STORAGE_PATH',
      './storage/exports',
    );
  }

  async createTransactionExport(
    userId: string,
    filters: CreateTransactionExportDto,
  ) {
    if (filters.categoryId)
      await this.categories.resolveReference(
        filters.categoryId,
        userId,
        filters.type,
        true,
      );
    const { format, ...transactionFilters } = filters;
    // Creates a new transaction export record in the database with status PENDING.
    const transactionExport = await this.repository.create(
      userId,
      format as TransactionExportFormat,
      this.hasFilters(transactionFilters) ? transactionFilters : undefined,
    );

    try {
      // Schedules a job in the export queue to process the transaction export asynchronously.
      await this.exportQueue.add(
        TRANSACTION_EXPORT_JOB, // name
        { exportId: transactionExport.id, userId }, // data
        {
          // options
          jobId: transactionExport.id, // jobId is set to the export ID to ensure uniqueness and prevent duplicate jobs for the same export.
          attempts: 2, // The job will be retried up to 2 times in case of failure.
          removeOnComplete: true, // The job will be automatically removed from the queue when it completes successfully.
          removeOnFail: 100, // The job will be automatically removed from the queue after 100 failed attempts.
        },
      );
    } catch (error) {
      // if scheduling the job fails, the export record is updated to FAILED status and an error message is stored in the database.
      await this.repository.markSchedulingFailed(transactionExport.id, userId);
      throw error;
    }

    return {
      id: transactionExport.id,
      status: transactionExport.status,
      progress: transactionExport.progress,
      format: transactionExport.format ?? TransactionExportFormat.PDF,
    };
  }

  async getLatestExport(userId: string) {
    const transactionExport = await this.repository.findLatest(userId);

    if (!transactionExport) {
      throw new NotFoundException(
        'Nenhuma exportação foi encontrada para este usuário.',
      );
    }

    return {
      id: transactionExport.id,
      status: transactionExport.status,
      progress: transactionExport.progress,
      format: transactionExport.format ?? TransactionExportFormat.PDF,
      errorMessage: transactionExport.errorMessage,
      createdAt: transactionExport.createdAt,
      completedAt: transactionExport.completedAt,
    };
  }

  async getDownload(id: string, userId: string) {
    const transactionExport = await this.findOwnedExport(id, userId);

    // Verifies that the export is completed before allowing the download. If the export is not completed, a ConflictException is thrown.
    if (transactionExport.status !== TransactionExportStatus.COMPLETED) {
      throw new ConflictException(
        'A exportação ainda não está concluída para download.',
      );
    }

    if (!transactionExport.fileName) {
      throw new NotFoundException(
        'O arquivo desta exportação não está mais disponível.',
      );
    }

    const format = transactionExport.format ?? TransactionExportFormat.PDF;
    const extension = format === TransactionExportFormat.CSV ? 'csv' : 'pdf';
    if (transactionExport.fileName !== `${id}.${extension}`) {
      throw new NotFoundException('Arquivo de exportação inválido.');
    }

    // Constructs the full file path for the export file
    // based on the storage path and the file name stored in the database.
    const filePath = join(this.storagePath, transactionExport.fileName);

    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new NotFoundException(
        'O arquivo desta exportação não está mais disponível. Ele pode ter sido removido após uma reinicialização ou novo deploy.',
      );
    }

    return {
      filePath,
      fileName: transactionExport.fileName,
      contentType:
        format === TransactionExportFormat.CSV
          ? 'text/csv; charset=utf-8'
          : 'application/pdf',
    };
  }

  private async findOwnedExport(id: string, userId: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw new NotFoundException('Exportação não encontrada.');
    }

    const transactionExport = await this.repository.findOwned(id, userId);

    if (!transactionExport) {
      throw new NotFoundException('Exportação não encontrada.');
    }

    return transactionExport;
  }

  private hasFilters(filters: CreateTransactionExportDto): boolean {
    return Object.values(filters).some((value) => value !== undefined);
  }
}
