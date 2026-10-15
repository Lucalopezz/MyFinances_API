import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionQueriesService } from '../../services/transaction-queries.service';
import { CreateTransactionExportDto } from '../dto/create-transaction-export.dto';
import { TransactionExportWriter } from '../types/transaction-export-writer.types';

@Injectable()
export class TransactionExportReaderService {
  private readonly batchSize: number;

  constructor(
    private readonly transactions: TransactionQueriesService,
    config: ConfigService,
  ) {
    const size = Number(
      config.get<string>('TRANSACTION_EXPORT_BATCH_SIZE', '500'),
    );
    // Valores inválidos não podem impedir o avanço da paginação. O limite
    // padrão mantém o consumo de memória restrito a um lote por vez.
    this.batchSize = Number.isInteger(size) && size > 0 ? size : 500;
  }

  /**
   * Percorre os candidatos do usuário por cursor, descriptografa cada registro
   * e envia somente os que passaram pelo filtro ao escritor escolhido.
   * O callback mantém o progresso do job separado da leitura dos registros.
   */
  async writeTransactions(
    userId: string,
    filters: CreateTransactionExportDto | undefined,
    writer: TransactionExportWriter,
    onProgress: (progress: number) => Promise<void>,
  ): Promise<void> {
    // Data e tipo usam campos indexados. A categoria tem IV aleatório e só
    // pode ser comparada após a descriptografia, antes de escrever o arquivo.
    const candidates = {
      userId,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      type: filters?.type,
    };
    const total = await this.transactions.countExportCandidates(candidates);
    let processed = 0;
    let cursorId: string | undefined;

    while (true) {
      const batch = await this.transactions.findExportBatch(
        candidates,
        cursorId,
        this.batchSize,
      );
      if (batch.length === 0) break;
      for (const transaction of batch) {
        const decrypted = transaction;
        if (!filters?.categoryId || decrypted.category === filters.categoryId) {
          await writer.addTransaction(decrypted);
        }
        // O progresso conta candidatos examinados; os totais do relatório
        // contam somente os que efetivamente foram enviados ao escritor.
        processed++;
      }

      // Mesmo um lote totalmente descartado precisa avançar pelo último ID.
      // 100% fica reservado à confirmação da gravação completa pelo worker.
      cursorId = batch[batch.length - 1].id;
      await onProgress(
        total ? Math.min(99, Math.floor((processed / total) * 100)) : 99,
      );
    }
  }
}
