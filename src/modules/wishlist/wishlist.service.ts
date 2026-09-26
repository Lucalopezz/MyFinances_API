import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from './dtos/wishlist.dto';
import { Prisma } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import {
  buildDateIndex,
  decryptTransactions,
} from '../transactions/transaction-encryption.mapper';
import { WishlistRepository } from './repositories/wishlist.repository';

@Injectable()
export class WishlistService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}
  async updateWishlistItemsSavings(userId: string): Promise<void> {
    const monthlySavings = await this.calculateAnnualSavings(userId);

    // atualiza todos os itens da wishlist do usuário
    await this.repository.updateSavings(userId, monthlySavings);
  }
  async calculateAnnualSavings(userId: string): Promise<number> {
    // Obtém a data atual
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);

    // busca todas as transações do usuário no ano atual
    const transactions = await this.repository.findTransactionsByPeriod(
      userId,
      buildDateIndex(startOfYear),
      buildDateIndex(endOfYear),
    );

    if (!transactions || transactions.length === 0) {
      throw new NotFoundException(
        'Transações não encontradas para o ano atual.',
      );
    }

    const decryptedTransactions = decryptTransactions(
      transactions,
      this.encryptionService,
    );

    const totalIncome = decryptedTransactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.value, 0);

    const totalExpenses = decryptedTransactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.value, 0);

    return totalIncome - totalExpenses;
  }

  async createWishlistItem(dto: CreateWishlistItemDto, userId: string) {
    try {
      const annualSavings = await this.calculateAnnualSavings(userId);

      const wishlistItem = await this.repository.create(
        dto,
        userId,
        annualSavings,
      );

      await this.updateWishlistItemsSavings(userId);

      return wishlistItem;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Erro ao criar item na wishlist.');
    }
  }

  async getWishlistItems(userId: string) {
    return this.repository.findByUser(userId);
  }

  async getWishlistItem(id: string, userId: string) {
    try {
      const wish = await this.repository.findOwned(id, userId);

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

  async updateWishlistItem(
    id: string,
    dto: UpdateWishlistItemDto,
    userId: string,
  ) {
    const wishId = await this.getWishlistItem(id, userId);

    const wish = await this.repository.updateOwned(wishId.id, userId, dto);
    await this.updateWishlistItemsSavings(userId);

    return wish;
  }

  async deleteWishlistItem(id: string, userId: string) {
    const wishId = await this.getWishlistItem(id, userId);
    return this.repository.removeOwned(wishId.id, userId);
  }
}
