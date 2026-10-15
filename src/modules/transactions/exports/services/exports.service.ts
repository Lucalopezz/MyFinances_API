import { transactionExportFilename } from '../helpers/transaction-export-filename.helper';
import { CategoriesService } from '../../../categories/categories.service';
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
} from '../constants/exports.constants';
import { CreateTransactionExportDto } from '../dto/create-transaction-export.dto';
import { TransactionExportJob } from '../types/transaction-export.types';
import { TRANSACTION_EXPORT_FILE_TYPES } from '../constants/transaction-export.formats';
import { TransactionExportsRepository } from '../repositories/transaction-exports.repository';

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
    // O registro começa como PENDING antes de entrar na fila, permitindo
    // consultar seu status enquanto ele aguarda a execução pelo worker.
    const transactionExport = await this.repository.create(
      userId,
      format as TransactionExportFormat,
      this.hasFilters(transactionFilters) ? transactionFilters : undefined,
    );

    try {
      // A fila recebe somente IDs. Os dados financeiros são buscados pelo
      // worker no escopo do usuário, sem serem copiados para o payload do job.
      await this.exportQueue.add(
        TRANSACTION_EXPORT_JOB,
        { exportId: transactionExport.id, userId },
        {
          // Usar o ID da exportação identifica o mesmo trabalho na fila e
          // evita duplicá-lo enquanto esse job estiver registrado no BullMQ.
          jobId: transactionExport.id,
          // Limita a execução a duas tentativas em caso de falha.
          attempts: 2,
          // Libera os jobs concluídos e mantém os 100 últimos com falha para
          // diagnóstico, sem deixar o histórico da fila crescer sem limite.
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      // Se a fila rejeitar o agendamento, o registro precisa sair de PENDING:
      // não haverá worker responsável por atualizar seu status depois.
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
      downloadName: transactionExportFilename(
        TRANSACTION_EXPORT_FILE_TYPES[
          transactionExport.format ?? TransactionExportFormat.PDF
        ].extension,
        transactionExport.completedAt ?? transactionExport.createdAt,
        transactionExport.filters,
      ),
    };
  }

  async getDownload(id: string, userId: string) {
    const transactionExport = await this.findOwnedExport(id, userId);

    // Somente COMPLETED permite download. O worker grava esse status depois
    // de confirmar a escrita completa, evitando arquivos ainda em produção.
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
    const { extension, contentType } = TRANSACTION_EXPORT_FILE_TYPES[format];
    if (transactionExport.fileName !== `${id}.${extension}`) {
      throw new NotFoundException('Arquivo de exportação inválido.');
    }

    // O nome precisa corresponder exatamente ao ID e ao formato acima antes
    // de montar o caminho, impedindo referências a outros arquivos do disco.
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
      fileName: transactionExportFilename(
        extension,
        transactionExport.completedAt ?? transactionExport.createdAt,
        transactionExport.filters,
      ),
      contentType,
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
