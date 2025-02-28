import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFixedExpenseDto } from './dtos/fixed-expense.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FixedExpensesService {
  constructor(private prisma: PrismaService) {}

  async createFixedExpense(dto: CreateFixedExpenseDto) {
    try {
      const fixedExpense = await this.prisma.fixedExpense.create({
        data: {
          name: dto.name,
          amount: dto.amount,
          dueDate: dto.dueDate,
          recurrence: dto.recurrence,
          user: { connect: { id: '67c0b2bb3242fe3f7df1c069' } },
        },
      });
      // aqui vai precisar ter uma função que notifica o user se a despesa está proxima
      return fixedExpense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Usuário com ID " futuro ID " não encontrado.`,
          );
        }

        throw new InternalServerErrorException('Erro ao criar a despesa fixa.');
      }

      throw new InternalServerErrorException('Ocorreu um erro inesperado.');
    }
  }

  async getFixedExpenses() {
    return this.prisma.fixedExpense.findMany({
      where: { userId: '67c0b2bb3242fe3f7df1c069' },
      orderBy: { dueDate: 'asc' },
    });
  }
}
