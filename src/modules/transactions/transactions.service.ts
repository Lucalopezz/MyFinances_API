import { CategoriesService } from '../categories/categories.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CreateTransactionDto,
  TransactionsQueryDto,
  TransactionSearchDto,
  TransactionSummaryDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import {
  buildEncryptedTransactionData,
  buildEncryptedTransactionUpdateData,
  decryptTransaction,
  decryptTransactions,
  EncryptedTransactionRecord,
  DecryptedTransaction,
} from './transaction-encryption.mapper';
import { TransactionsRepository } from './repositories/transactions.repository';

type SearchCursor = {
  v: 1;
  dateIndex: number;
  id: string;
  fingerprint: string;
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  async createTransaction(dto: CreateTransactionDto, userId: string) {
    await this.categories.resolveReference(dto.category, userId, dto.type);
    const transaction = await this.repository.create(
      buildEncryptedTransactionData(
        {
          value: dto.value,
          date: dto.date,
          category: dto.category,
          description: dto.description,
          type: dto.type,
          userId,
        },
        this.encryptionService,
      ),
    );

    return decryptTransaction(
      transaction as unknown as EncryptedTransactionRecord,
      this.encryptionService,
    );
  }
  async getTransactions(query: TransactionsQueryDto, userId: string) {
    const { page, limit } = query;
    const { items, total } = await this.repository.findPage(
      userId,
      page,
      limit,
    );

    return {
      data: decryptTransactions(items, this.encryptionService),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchTransactions(query: TransactionSearchDto, userId: string) {
    const { limit, category, search, type, startDate, endDate } = query;
    if (category)
      await this.categories.resolveReference(category, userId, type, true);
    const catalog = search ? await this.categories.list(userId) : [];
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({ userId, category, search, type, startDate, endDate }),
      )
      .digest('hex');
    const cursor = query.cursor
      ? this.parseSearchCursor(query.cursor, fingerprint)
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
        if (category && item.category !== category) continue;
        if (
          searchText &&
          !item.category.toLocaleLowerCase('pt-BR').includes(searchText) &&
          !catalog
            .find((entry) => entry.id === item.category)
            ?.name.toLocaleLowerCase('pt-BR')
            .includes(searchText) &&
          !item.description?.toLocaleLowerCase('pt-BR').includes(searchText)
        )
          continue;

        if (data.length === limit) {
          const nextCursor = Buffer.from(
            JSON.stringify({
              v: 1,
              dateIndex: lastReturnedPosition.dateIndex,
              id: lastReturnedPosition.id,
              fingerprint,
            } satisfies SearchCursor),
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

  private async calculateSummary(
    query: Omit<TransactionSearchDto, 'limit' | 'cursor'>,
    userId: string,
  ) {
    let incomeCents = 0;
    let expenseCents = 0;
    let count = 0;
    let cursor: string | undefined;
    // Reuse search filters and indexed cursors, retaining only one batch.
    do {
      const page = await this.searchTransactions(
        { ...query, limit: 100, cursor },
        userId,
      );
      for (const item of page.data) {
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

  private parseSearchCursor(value: string, fingerprint: string): SearchCursor {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as SearchCursor;
      if (
        cursor.v !== 1 ||
        cursor.fingerprint !== fingerprint ||
        !Number.isInteger(cursor.dateIndex) ||
        cursor.dateIndex < 10000101 ||
        !/^[a-f\d]{24}$/i.test(cursor.id)
      )
        throw new Error();
      return cursor;
    } catch {
      throw new BadRequestException('Cursor inválido para esta busca.');
    }
  }
  async getTransaction(id: string, userId: string) {
    const transaction = await this.repository.findOwned(id, userId);
    if (!transaction) {
      throw new NotFoundException(`Transação com ID "${id}" não encontrada.`);
    }

    return decryptTransaction(
      transaction as unknown as EncryptedTransactionRecord,
      this.encryptionService,
    );
  }

  async updateTransaction(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ) {
    const currentTransaction = await this.getTransaction(id, userId);

    await this.categories.resolveReference(
      dto.category ?? currentTransaction.category,
      userId,
      dto.type,
      (!dto.category || dto.category === currentTransaction.category) &&
        dto.type === currentTransaction.type,
    );
    const transaction = await this.repository.updateOwned(
      id,
      userId,
      buildEncryptedTransactionUpdateData(
        dto,
        currentTransaction,
        this.encryptionService,
      ),
    );

    return decryptTransaction(
      transaction as unknown as EncryptedTransactionRecord,
      this.encryptionService,
    );
  }

  async deleteTransaction(id: string, userId: string) {
    await this.getTransaction(id, userId);

    await this.repository.deleteOwned(id, userId);
    return { message: 'Deletado com sucesso!' };
  }
}
