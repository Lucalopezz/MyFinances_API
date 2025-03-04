import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';
import { WishlistService } from '../wishlist/wishlist.service';
import { Prisma } from '@prisma/client';

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
        user: {
          connect: { id: userId },
        },
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
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id, userId },
      });
      if (!transaction) {
        throw new NotFoundException(`Transação com ID "${id}" não encontrada.`);
      }

      return transaction;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Transação com ID "${id}" não encontrada.`,
          );
        }

        throw new InternalServerErrorException('Erro ao buscar a transação.');
      }

      throw new InternalServerErrorException('Ocorreu um erro inesperado.');
    }
  }

  async updateTransaction(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ) {
    const transactionData = this.getTransaction(id, userId);
    if (!transactionData) {
      throw new NotFoundException(`Transação com ID ${id} não encontrada`);
    }
    const transaction = this.prisma.transaction.update({
      where: { id, userId },
      data: {
        ...dto,
      },
    });
    await this.wishlistService.updateWishlistItemsSavings(
      (await transaction).userId,
    );

    return transaction;
  }

  async deleteTransaction(id: string, userId: string) {
    const transaction = this.getTransaction(id, userId);
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
