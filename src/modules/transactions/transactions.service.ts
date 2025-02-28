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

  async createTransaction(dto: CreateTransactionDto) {
    const transaction = await this.prisma.transaction.create({
      data: {
        value: dto.value,
        date: dto.date,
        category: dto.category,
        description: dto.description,
        type: dto.type,
        user: {
          connect: { id: '67c0b2bb3242fe3f7df1c069' }, // adicionar corretamente depois
        },
      },
    });
    await this.wishlistService.updateWishlistItemsSavings(
      '67c0b2bb3242fe3f7df1c069',
    );

    return transaction;
  }
  async getTransactions() {
    return this.prisma.transaction.findMany({
      where: {
        userId: '67c0b2bb3242fe3f7df1c069',
      },
      orderBy: { date: 'desc' },
    });
  }

  async getTransaction(id: string) {
    return this.prisma.transaction.findUnique({
      where: { id },
    });
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto) {
    const transactionData = this.getTransaction(id);
    if (!transactionData) {
      throw new NotFoundException(`Transação com ID ${id} não encontrada`);
    }
    const transaction = this.prisma.transaction.update({
      where: { id },
      data: {
        ...dto,
      },
    });
    await this.wishlistService.updateWishlistItemsSavings(
      (await transaction).userId,
    );

    return transaction;
  }

  async deleteTransaction(id: string) {
    const transaction = this.getTransaction(id);
    if (!transaction) {
      throw new NotFoundException(`Transação com ID ${id} não encontrada`);
    }
    await this.prisma.transaction.delete({
      where: { id },
    });
    await this.wishlistService.updateWishlistItemsSavings(
      (await transaction).userId,
    );
    return { message: 'Deletado com sucesso!' };
  }
}
