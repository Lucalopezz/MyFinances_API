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

// Cada worker processa uma exportação por vez para limitar a disputa por CPU
// na geração de PDFs. A API segue atendendo requisições enquanto o job roda.
@Processor(TRANSACTION_EXPORT_QUEUE, { concurrency: 1 })
@Injectable()
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

  /**
   * Lê os dados do usuário em lotes, descriptografa os campos necessários e
   * escreve PDF ou CSV em disco. O download só fica disponível depois que
   * o stream confirma a gravação completa do arquivo.
   */
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
      // Mesmo contendo um ID válido, o job só pode acessar a exportação do
      // usuário informado. As consultas dos lançamentos repetem esse escopo.
      const transactionExport = await this.repository.findOwned(
        exportId,
        userId,
      );

      if (!transactionExport) {
        throw new Error('Exportação não encontrada para o job informado.');
      }

      // Carregamos o catálogo uma vez por exportação, incluindo categorias
      // arquivadas ainda usadas no histórico. O PDF traduz os IDs com esses
      // nomes sem alterar as referências persistidas ou exportadas no CSV.
      const catalog = await this.categories.list(userId);
      // Exportações antigas podem não ter formato; PDF preserva o padrão
      // original e determina a extensão que será validada no download.
      const format = transactionExport.format ?? TransactionExportFormat.PDF;
      const fileName = `${exportId}.${format === TransactionExportFormat.CSV ? 'csv' : 'pdf'}`;
      filePath = join(this.storagePath, fileName);

      const filters = transactionExport.filters as
        CreateTransactionExportDto | undefined;

      // O status sai de PENDING assim que o worker assume o job, permitindo
      // que o frontend diferencie espera na fila de processamento em curso.
      await this.repository.markProcessing(exportId, userId);

      // O diretório pode desaparecer entre reinicializações em ambientes com
      // armazenamento efêmero, por isso sua criação é idempotente a cada job.
      await mkdir(this.storagePath, { recursive: true });
      // Escrevemos diretamente no arquivo para não montar a exportação toda
      // em um Buffer. finished() permite aguardar também falhas de gravação.
      output = createWriteStream(filePath);
      outputFinished = finished(output);
      // O stream pode falhar enquanto ainda buscamos um lote. Este handler
      // evita uma rejeição não tratada nesse intervalo; o await mais abaixo
      // continua recebendo a falha e aciona a limpeza do arquivo parcial.
      outputFinished.catch(() => undefined);
      if (format === TransactionExportFormat.CSV) {
        await this.csvService.writeHeader(output);
      } else {
        document = this.pdfService.createDocument(filters, catalog);
        document.pipe(output);
      }

      // Período e tipo têm campos consultáveis no banco. A categoria usa
      // criptografia com IV aleatório: seu ciphertext não pode ser comparado
      // diretamente, então o filtro dela ocorre após a descriptografia.
      const candidates = {
        userId,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        type: filters?.type,
      };
      const total =
        await this.transactionsRepository.countExportCandidates(candidates);

      // O progresso considera os candidatos examinados, inclusive os que o
      // filtro de categoria descarta. Já o PDF conta somente os exportados.
      let processed = 0;
      let cursorId: string | undefined;

      while (true) {
        // O cursor pelo último ID permite percorrer o histórico em lotes sem
        // carregar todas as transações nem usar offsets crescentes no banco.
        const transactions = await this.transactionsRepository.findExportBatch(
          candidates,
          cursorId,
          this.batchSize,
        );

        if (transactions.length === 0) {
          break;
        }
        // Somente o registro corrente precisa estar em formato legível.
        // Aplicar o filtro antes de enviar ao gerador também garante que o
        // resumo financeiro some exclusivamente as linhas do arquivo final.
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
              this.pdfService.addTransaction(document, decrypted);
            }
          }

          processed++;
        }

        // Avançamos pelo último candidato lido, mesmo se nenhum lançamento
        // do lote passar pelo filtro, para não consultar o mesmo lote de novo.
        cursorId = transactions[transactions.length - 1].id;
        // Reservamos 100% para depois da gravação. Ler todos os registros
        // ainda não significa que o arquivo esteja pronto para download.
        const progress = total
          ? Math.min(99, Math.floor((processed / total) * 100))
          : 99;
        // O banco fornece o progresso ao frontend; o job mantém a mesma
        // informação para acompanhamento do processamento pelo BullMQ.
        await this.repository.updateProgress(exportId, userId, progress);
        await job.updateProgress(progress);
      }

      // O PDF ainda precisa acrescentar resumo e rodapé antes de encerrar;
      // o CSV já escreveu todo o conteúdo e pode finalizar o stream direto.
      if (document) this.pdfService.finalizeDocument(document);
      else output.end();
      // end() encerra a produção, mas a escrita em disco é assíncrona.
      // Aguardar finished() evita anunciar um arquivo ainda incompleto.
      await outputFinished;
      await this.repository.markCompleted(exportId, userId, fileName);
      await job.updateProgress(100);
    } catch (error) {
      // Interrompemos a geração e aguardamos o stream parar antes de remover
      // o arquivo parcial. Uma falha não pode deixar um download incompleto
      // nem um arquivo antigo quando o BullMQ tentar executar o job novamente.
      document?.destroy();
      output?.destroy();
      await outputFinished?.catch(() => undefined);
      if (filePath) await unlink(filePath).catch(() => undefined);

      // Uma falha secundária ao gravar FAILED é registrada separadamente,
      // preservando a exceção original que deve ser devolvida ao BullMQ.
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
    // A configuração vem como texto. Um tamanho inválido poderia impedir o
    // avanço da paginação; 500 mantém o limite padrão de memória por lote.
    const batchSize = Number(value);
    return Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 500;
  }
}
