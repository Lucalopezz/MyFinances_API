import { matchesTransaction } from '../domain/transaction-search';
import { parseSearchCursor } from '../helpers/transaction-search-cursor';
import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { CategoriesService } from '../../categories/categories.service';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import {
  TransactionSearchDto,
  TransactionSummaryDto,
} from '../dto/transaction.dto';
import {
  TransactionsRepository,
  TransactionExportCandidates,
} from '../repositories/transactions.repository';
import {
  buildDateIndex,
  decryptTransaction,
  decryptTransactions,
  DecryptedTransaction,
  EncryptedTransactionRecord,
} from '../mappers/transaction-encryption.mapper';
/** Consultas públicas de transações: mantém índices, cursores e descriptografia no módulo proprietário. */
@Injectable()
export class TransactionQueriesService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  /** Lê um período realizado para indicadores, sem expor registros criptografados. */
  async findByPeriod(userId: string, start: Date, end: Date) {
    return decryptTransactions(
      await this.repository.findByPeriod(
        userId,
        buildDateIndex(start),
        buildDateIndex(end),
      ),
      this.encryptionService,
    );
  }

  /** A projeção usa todo o realizado até o horizonte para calcular seu saldo-base. */
  async findThroughDate(userId: string, end: Date) {
    return decryptTransactions(
      await this.repository.findThroughDate(userId, buildDateIndex(end)),
      this.encryptionService,
    );
  }

  /** Mantém a paginação por ID usada nos orçamentos e entrega apenas um lote. */
  async findExpenseBatch(
    userId: string,
    start: number,
    end: number,
    cursor: string | undefined,
    take: number,
  ) {
    return decryptTransactions(
      await this.repository.findExpenseBatch(userId, start, end, cursor, take),
      this.encryptionService,
    );
  }

  countExportCandidates(candidates: TransactionExportCandidates) {
    return this.repository.countExportCandidates(candidates);
  }

  /** O filtro por categoria é aplicado pelo consumidor após a leitura deste lote. */
  async findExportBatch(
    candidates: TransactionExportCandidates,
    cursor: string | undefined,
    take: number,
  ) {
    return decryptTransactions(
      await this.repository.findExportBatch(candidates, cursor, take),
      this.encryptionService,
    );
  }

  /** A identidade externa é lida somente pela deduplicação, sem devolver o envelope criptográfico. */
  async findImportBatch(
    candidates: Parameters<TransactionsRepository['findSearchBatch']>[0],
    take: number,
  ) {
    const records = await this.repository.findSearchBatch(candidates, take);
    return records.map((record) => ({
      ...decryptTransaction(record, this.encryptionService),
      dateIndex: record.dateIndex,
      importIdentity: record.encryptedImportIdentity
        ? this.encryptionService.decrypt<{
            source: string;
            externalId: string;
          }>(record.encryptedImportIdentity)
        : null,
    }));
  }
  /**
   * Busca por índices em lotes e filtra os campos sensíveis após descriptografá-los.
   * O cursor marca o último resultado devolvido, com data e ID para desempatar a ordenação.
   */
  async searchTransactions(query: TransactionSearchDto, userId: string) {
    const { limit, category, search, type, startDate, endDate } = query;
    if (category)
      await this.categories.resolveReference(category, userId, type, true);
    const catalog = search ? await this.categories.list(userId) : [];
    // Vincula o cursor ao dono e aos filtros. Ele é um marcador de continuação,
    // não uma autorização: as consultas ao repository continuam filtrando por userId.
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({ userId, category, search, type, startDate, endDate }),
      )
      .digest('hex');
    const cursor = query.cursor
      ? this.cursor(query.cursor, fingerprint)
      : undefined;
    const data: DecryptedTransaction[] = [];
    const searchText = search?.toLocaleLowerCase('pt-BR');
    const startDateIndex = startDate
      ? Number(startDate.replaceAll('-', ''))
      : undefined;
    const endDateIndex = endDate
      ? Number(endDate.replaceAll('-', ''))
      : undefined;
    let position = cursor
      ? { dateIndex: cursor.dateIndex, id: cursor.id }
      : undefined;
    let lastReturnedPosition: { dateIndex: number; id: string } | undefined;

    // Categoria e descrição estão criptografadas. Um lote de 100 candidatos pode
    // render poucos resultados, então seguimos lendo até completar a página ou o histórico.
    while (true) {
      const batch = await this.repository.findSearchBatch(
        {
          userId,
          type,
          startDateIndex,
          endDateIndex,
          position,
        },
        100,
      );

      if (batch.length === 0) break;
      for (const encrypted of batch) {
        const item = decryptTransaction(
          encrypted as unknown as EncryptedTransactionRecord,
          this.encryptionService,
        );
        if (!matchesTransaction(item, category, searchText, catalog)) continue;

        // Só anunciamos outra página depois de encontrar mais um item compatível.
        // O cursor fica no último devolvido para esse item extra reaparecer na próxima leitura.
        if (data.length === limit) {
          const nextCursor = Buffer.from(
            JSON.stringify({
              v: 1,
              dateIndex: lastReturnedPosition.dateIndex,
              id: lastReturnedPosition.id,
              fingerprint,
            }),
          ).toString('base64url');
          return { data, nextCursor, hasMore: true };
        }
        data.push(item);
        lastReturnedPosition = {
          dateIndex: encrypted.dateIndex,
          id: encrypted.id,
        };
      }
      const lastCandidate = batch[batch.length - 1];
      position = { dateIndex: lastCandidate.dateIndex, id: lastCandidate.id };
      if (batch.length < 100) break;
    }

    return { data, nextCursor: null, hasMore: false };
  }

  async summarizeTransactions(query: TransactionSummaryDto, userId: string) {
    return this.calculateSummary(query, userId);
  }

  async getTotalBalance(userId: string) {
    return this.calculateSummary({}, userId);
  }

  /** Totaliza todas as páginas dos filtros, independentemente da página aberta no front. */
  private async calculateSummary(
    query: Omit<TransactionSearchDto, 'limit' | 'cursor'>,
    userId: string,
  ) {
    let incomeCents = 0;
    let expenseCents = 0;
    let count = 0;
    let cursor: string | undefined;
    // Reutiliza filtros de busca e cursores indexados, mantendo apenas um lote na memória.
    do {
      const page = await this.searchTransactions(
        { ...query, limit: 100, cursor },
        userId,
      );
      for (const item of page.data) {
        // Soma centavos inteiros para que resíduos de ponto flutuante não se acumulem
        // ao percorrer um histórico grande; converte para reais apenas na resposta.
        if (item.type === 'INCOME') incomeCents += Math.round(item.value * 100);
        else expenseCents += Math.round(item.value * 100);
        count++;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return {
      totalIncome: incomeCents / 100,
      totalExpense: expenseCents / 100,
      balance: (incomeCents - expenseCents) / 100,
      count,
    };
  }

  private cursor(value: string, fingerprint: string) {
    try {
      return parseSearchCursor(value, fingerprint);
    } catch {
      throw new BadRequestException('Cursor inválido para esta busca.');
    }
  }
}
