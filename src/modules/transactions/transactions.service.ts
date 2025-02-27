import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTransactionDto } from './dtos/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async createTransaction(dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
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
  }
}
