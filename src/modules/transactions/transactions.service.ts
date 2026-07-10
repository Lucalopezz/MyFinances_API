import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateTransactionDto,
  TransactionsQueryDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';
import { WishlistService } from '../wishlist/wishlist.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import {
  buildEncryptedTransactionData,
  buildEncryptedTransactionUpdateData,
  decryptTransaction,
  decryptTransactions,
  EncryptedTransactionRecord,
} from './transaction-encryption.mapper';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private readonly wishlistService: WishlistService,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  async createTransaction(dto: CreateTransactionDto, userId: string) {
    const transaction = await this.prisma.transaction.create({
      data: buildEncryptedTransactionData(
        {
          value: dto.value,
          date: dto.date,
          category: dto.category,
          description: dto.description,
          type: dto.type,
          userId,
        },
        this.encryptionService,
      ) as never,
    });
    await this.wishlistService.updateWishlistItemsSavings(userId);

    return decryptTransaction(
      transaction as unknown as EncryptedTransactionRecord,
      this.encryptionService,
    );
  }
  async getTransactions(query: TransactionsQueryDto, userId: string) {
    const { page, limit } = query;
    const where = { userId };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { dateIndex: 'desc' } as never,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: decryptTransactions(
        transactions as unknown as EncryptedTransactionRecord[],
        this.encryptionService,
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async getTransaction(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
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

    const transaction = await this.prisma.transaction.update({
      where: { id },
      data: buildEncryptedTransactionUpdateData(
        dto,
        currentTransaction,
        this.encryptionService,
      ) as never,
    });
    await this.wishlistService.updateWishlistItemsSavings(userId);

    return decryptTransaction(
      transaction as unknown as EncryptedTransactionRecord,
      this.encryptionService,
    );
  }

  async deleteTransaction(id: string, userId: string) {
    await this.getTransaction(id, userId);

    await this.prisma.transaction.delete({
      where: { id },
    });
    await this.wishlistService.updateWishlistItemsSavings(userId);
    return { message: 'Deletado com sucesso!' };
  }
}
