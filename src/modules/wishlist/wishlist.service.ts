import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from './dtos/wishlist.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}
  async updateWishlistItemsSavings(userId: string): Promise<void> {
    const monthlySavings = await this.calculateAnnualSavings(userId);

    // atualiza todos os itens da wishlist do usuário
    await this.prisma.wishlistItem.updateMany({
      where: { userId },
      data: { savedAmount: monthlySavings },
    });
  }
  async calculateAnnualSavings(userId: string): Promise<number> {
    // Obtém a data atual
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);

    // busca todas as transações do usuário no ano atual
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
    });

    if (!transactions || transactions.length === 0) {
      throw new NotFoundException(
        'Transações não encontradas para o ano atual.',
      );
    }

    const totalIncome = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.value, 0);

    const totalExpenses = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.value, 0);

    return totalIncome - totalExpenses;
  }

  async createWishlistItem(dto: CreateWishlistItemDto) {
    try {
      const annualSavings = await this.calculateAnnualSavings(
        '67c0b2bb3242fe3f7df1c069',
      );

      const wishlistItem = await this.prisma.wishlistItem.create({
        data: {
          name: dto.name,
          desiredValue: dto.desiredValue,
          savedAmount: annualSavings,
          targetDate: dto.targetDate,
          userId: '67c0b2bb3242fe3f7df1c069',
        },
      });

      await this.updateWishlistItemsSavings('67c0b2bb3242fe3f7df1c069');

      return wishlistItem;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Erro ao criar item na wishlist.');
    }
  }

  async getWishlistItems() {
    return this.prisma.wishlistItem.findMany({
      where: {
        userId: '67c0b2bb3242fe3f7df1c069',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getWishlistItem(id: string) {
    try {
      const wish = await this.prisma.wishlistItem.findUnique({
        where: { id },
      });

      if (!wish) {
        throw new NotFoundException(`Item com ID "${id}" não encontrado.`);
      }

      return wish;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Item com ID "${id}" não encontrado.`);
        }

        throw new InternalServerErrorException(
          'Erro ao buscar o item na wishlist.',
        );
      }

      throw new InternalServerErrorException('Ocorreu um erro inesperado.');
    }
  }

  async updateWishlistItem(id: string, dto: UpdateWishlistItemDto) {
    const wishId = await this.getWishlistItem(id);

    const wish = await this.prisma.wishlistItem.update({
      where: { id: wishId.id },
      data: {
        ...dto,
      },
    });
    await this.updateWishlistItemsSavings('67c0b2bb3242fe3f7df1c069');

    return wish;
  }

  async deleteWishlistItem(id: string) {
    const wishId = await this.getWishlistItem(id);
    return this.prisma.wishlistItem.delete({
      where: { id: wishId.id },
    });
  }
}
