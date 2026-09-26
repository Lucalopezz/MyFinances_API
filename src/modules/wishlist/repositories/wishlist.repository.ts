import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from '../dtos/wishlist.dto';
import { EncryptedTransactionRecord } from '../../transactions/transaction-encryption.mapper';

@Injectable()
export class WishlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  updateSavings(userId: string, savedAmount: number) {
    return this.prisma.wishlistItem.updateMany({
      where: { userId },
      data: { savedAmount },
    });
  }

  async findTransactionsByPeriod(
    userId: string,
    startDateIndex: number,
    endDateIndex: number,
  ): Promise<EncryptedTransactionRecord[]> {
    const items = await this.prisma.transaction.findMany({
      where: { userId, dateIndex: { gte: startDateIndex, lte: endDateIndex } },
    });
    return items as unknown as EncryptedTransactionRecord[];
  }

  create(dto: CreateWishlistItemDto, userId: string, savedAmount: number) {
    return this.prisma.wishlistItem.create({
      data: {
        name: dto.name,
        desiredValue: dto.desiredValue,
        savedAmount,
        targetDate: dto.targetDate,
        userId,
      },
    });
  }

  findByUser(userId: string) {
    return this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOwned(id: string, userId: string) {
    return this.prisma.wishlistItem.findUnique({ where: { id, userId } });
  }

  updateOwned(id: string, userId: string, dto: UpdateWishlistItemDto) {
    return this.prisma.wishlistItem.update({
      where: { id, userId },
      data: dto,
    });
  }

  removeOwned(id: string, userId: string) {
    return this.prisma.wishlistItem.delete({ where: { id, userId } });
  }
}
