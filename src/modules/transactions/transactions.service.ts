import { TransactionQueriesService } from './services/transaction-queries.service';
import { CategoriesService } from '../categories/categories.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateTransactionDto,
  TransactionsQueryDto,
  TransactionSearchDto,
  TransactionSummaryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import {
  buildEncryptedTransactionData,
  buildEncryptedTransactionUpdateData,
  decryptTransaction,
  decryptTransactions,
  EncryptedTransactionRecord,
} from './mappers/transaction-encryption.mapper';
import { TransactionsRepository } from './repositories/transactions.repository';

/** Coordena gravações de transações e delega buscas à consulta pública do domínio. */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: TransactionsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
    private readonly queries: TransactionQueriesService,
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

  searchTransactions(query: TransactionSearchDto, userId: string) {
    return this.queries.searchTransactions(query, userId);
  }

  summarizeTransactions(query: TransactionSummaryDto, userId: string) {
    return this.queries.summarizeTransactions(query, userId);
  }

  getTotalBalance(userId: string) {
    return this.queries.getTotalBalance(userId);
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
