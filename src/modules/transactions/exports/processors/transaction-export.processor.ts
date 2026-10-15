import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionExportFormat } from '@prisma/client';
import { Job } from 'bullmq';
import { createWriteStream, WriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { finished } from 'stream/promises';
import { CategoriesService } from '../../../categories/categories.service';
import {
  TRANSACTION_EXPORT_JOB,
  TRANSACTION_EXPORT_QUEUE,
} from '../constants/exports.constants';
import { TRANSACTION_EXPORT_FILE_TYPES } from '../constants/transaction-export.formats';
import { CreateTransactionExportDto } from '../dto/create-transaction-export.dto';
import { TransactionExportsRepository } from '../repositories/transaction-exports.repository';
import { TransactionExportReaderService } from '../services/transaction-export-reader.service';
import { TransactionExportWriterFactory } from '../services/transaction-export-writer.factory';
import { TransactionExportJob } from '../types/transaction-export.types';
import { TransactionExportWriter } from '../types/transaction-export-writer.types';

// Um job por worker limita a disputa por CPU, enquanto a API segue atendendo.
@Processor(TRANSACTION_EXPORT_QUEUE, { concurrency: 1 })
@Injectable()
export class TransactionExportProcessor extends WorkerHost {
  private readonly logger = new Logger(TransactionExportProcessor.name);
  private readonly storagePath: string;

  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionExportsRepository,
    config: ConfigService,
    private readonly reader: TransactionExportReaderService,
    private readonly writers: TransactionExportWriterFactory,
  ) {
    super();
    this.storagePath = config.get<string>(
      'EXPORT_STORAGE_PATH',
      './storage/exports',
    );
  }

  /**
   * Coordena o job, o arquivo e as mudanças de status. A leitura/descriptografia
   * e os detalhes de PDF, CSV e XLSX pertencem a serviços específicos.
   */
  async process(job: Job<TransactionExportJob>): Promise<void> {
    if (job.name !== TRANSACTION_EXPORT_JOB) {
      throw new Error(`Job de exportação desconhecido: ${job.name}`);
    }
    const { exportId, userId } = job.data;
    let filePath: string | undefined;
    let output: WriteStream | undefined;
    let outputFinished: Promise<void> | undefined;
    let writer: TransactionExportWriter | undefined;

    try {
      // O registro e todas as consultas do leitor pertencem ao mesmo usuário.
      const record = await this.repository.findOwned(exportId, userId);
      if (!record)
        throw new Error('Exportação não encontrada para o job informado.');
      const catalog = await this.categories.list(userId);
      const format = record.format ?? TransactionExportFormat.PDF;
      const fileName = `${exportId}.${TRANSACTION_EXPORT_FILE_TYPES[format].extension}`;
      filePath = join(this.storagePath, fileName);
      const filters = record.filters as CreateTransactionExportDto | undefined;
      await this.repository.markProcessing(exportId, userId);

      await mkdir(this.storagePath, { recursive: true });
      output = createWriteStream(filePath);
      outputFinished = finished(output);
      // O disco pode falhar durante a consulta de um lote. Trata a rejeição
      // antecipada sem esconder a falha do await que confirma a gravação.
      outputFinished.catch(() => undefined);
      writer = await this.writers.create(format, output, filters, catalog);

      await this.reader.writeTransactions(
        userId,
        filters,
        writer,
        async (progress) => {
          await this.repository.updateProgress(exportId, userId, progress);
          await job.updateProgress(progress);
        },
      );

      // Finalizar o documento não basta: a escrita em disco também precisa
      // terminar. A espera conjunta detecta falhas mesmo ao fechar o ZIP XLSX.
      await Promise.all([writer.finalize(), outputFinished]);
      await this.repository.markCompleted(exportId, userId, fileName);
      await job.updateProgress(100);
    } catch (error) {
      // O escritor cancela seu documento; o worker fecha e remove o arquivo
      // parcial, para que uma nova tentativa não ofereça conteúdo incompleto.
      writer?.abort();
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
}
