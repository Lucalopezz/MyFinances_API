import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';
import { WishlistService } from '../wishlist/wishlist.service';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private readonly wishlistService: WishlistService,
  ) {}

  async createTransaction(dto: CreateTransactionDto, userId: string) {
    const transaction = await this.prisma.transaction.create({
      data: {
        value: dto.value,
        date: dto.date,
        category: dto.category,
        description: dto.description,
        type: dto.type,
        userId,
      },
    });
    await this.wishlistService.updateWishlistItemsSavings(userId);

    return transaction;
  }
  async getTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
      },
      orderBy: { date: 'desc' },
    });
  }
  async getTransaction(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transação com ID "${id}" não encontrada.`);
    }

    return transaction;
  }

  async updateTransaction(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ) {
    await this.getTransaction(id, userId);

    const transaction = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...dto,
      },
    });
    await this.wishlistService.updateWishlistItemsSavings(userId);

    return transaction;
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
