import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionExportStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { constants } from 'fs';
import { access } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  TRANSACTION_EXPORT_JOB,
  TRANSACTION_EXPORT_QUEUE,
} from './exports.constants';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';
import { TransactionExportJob } from './transaction-export.types';

@Injectable()
export class ExportsService {
  private readonly storagePath: string;

  constructor(
    private readonly prisma: PrismaService,
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
    // Creates a new transaction export record in the database with status PENDING.
    const transactionExport = await this.prisma.transactionExport.create({
      data: {
        userId,
        status: TransactionExportStatus.PENDING,
        progress: 0,
        filters: this.hasFilters(filters) ? filters : undefined,
      },
    });

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
      await this.prisma.transactionExport.update({
        where: { id: transactionExport.id },
        data: {
          status: TransactionExportStatus.FAILED,
          errorMessage: 'Não foi possível agendar a exportação.',
        },
      });
      throw error;
    }

    return {
      id: transactionExport.id,
      status: transactionExport.status,
      progress: transactionExport.progress,
    };
  }

  async getLatestExport(userId: string) {
    const transactionExport = await this.prisma.transactionExport.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!transactionExport) {
      throw new NotFoundException(
        'Nenhuma exportação foi encontrada para este usuário.',
      );
    }

    return {
      id: transactionExport.id,
      status: transactionExport.status,
      progress: transactionExport.progress,
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
    };
  }

  private async findOwnedExport(id: string, userId: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw new NotFoundException('Exportação não encontrada.');
    }

    const transactionExport = await this.prisma.transactionExport.findFirst({
      where: { id, userId },
    });

    if (!transactionExport) {
      throw new NotFoundException('Exportação não encontrada.');
    }

    return transactionExport;
  }

  private hasFilters(filters: CreateTransactionExportDto): boolean {
    return Object.values(filters).some((value) => value !== undefined);
  }
}
