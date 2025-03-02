import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from './dtos/fixed-expense.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class FixedExpensesService {
  constructor(
    private prisma: PrismaService,
    // private notificationService,
  ) {}

  // Cria uma nova despesa fixa
  async createFixedExpense(dto: CreateFixedExpenseDto) {
    try {
      const expense = await this.prisma.fixedExpense.create({
        data: {
          name: dto.name,
          amount: dto.amount,
          dueDate: dto.dueDate,
          recurrence: dto.recurrence,
          isPaid: dto.isPaid || false, // Define como false se não for fornecido
          user: { connect: { id: '67c0b2bb3242fe3f7df1c069' } },
        },
      });

      // Verifica se a despesa está próxima da data de vencimento para notificar
      await this.checkDueDateAndNotify(expense);

      return expense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new InternalServerErrorException(
            'Já existe uma despesa fixa com esse nome.',
          );
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(`Usuário com ID " id " não encontrado.`);
        }
      }
      throw new InternalServerErrorException('Erro ao criar a despesa fixa.');
    }
  }

  // Retorna todas as despesas fixas do usuário
  async getFixedExpenses() {
    try {
      return this.prisma.fixedExpense.findMany({
        where: { userId: '67c0b2bb3242fe3f7df1c069' },
        orderBy: { dueDate: 'asc' },
      });
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Erro ao buscar as despesas fixas.',
      );
    }
  }

  // Retorna uma despesa fixa específica pelo ID
  async getFixedExpense(id: string) {
    try {
      const expense = await this.prisma.fixedExpense.findUnique({
        where: { id },
      });
      if (!expense) {
        throw new NotFoundException(
          `Despesa fixa com ID "${id}" não encontrada.`,
        );
      }
      return expense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Despesa fixa com ID "${id}" não encontrada.`,
          );
        }
      }
      throw new InternalServerErrorException('Erro ao buscar a despesa fixa.');
    }
  }

  // Atualiza uma despesa fixa
  async updateFixedExpense(id: string, dto: UpdateFixedExpenseDto) {
    try {
      const expense = await this.prisma.fixedExpense.update({
        where: { id },
        data: { ...dto },
      });

      // Se a despesa foi marcada como paga, ela será resetada automaticamente no próximo ciclo.
      // Se não estiver paga, verificamos se está próxima do vencimento para notificar
      if (!dto.isPaid) {
        await this.checkDueDateAndNotify(expense);
      }

      return expense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Despesa fixa com ID "${id}" não encontrada.`,
          );
        }
      }
      throw new InternalServerErrorException(
        'Erro ao atualizar a despesa fixa.',
      );
    }
  }

  // Exclui uma despesa fixa
  async deleteFixedExpense(id: string) {
    try {
      const expense = await this.prisma.fixedExpense.delete({ where: { id } });
      return expense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Despesa fixa com ID "${id}" não encontrada.`,
          );
        }
      }
      throw new InternalServerErrorException('Erro ao excluir a despesa fixa.');
    }
  }

  // Rotina agendada para resetar as despesas fixas de um novo ciclo
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetFixedExpenses() {
    try {
      const today = new Date();
      // Encontra despesas cujo dueDate já passou e que foram pagas
      const expensesToReset = await this.prisma.fixedExpense.findMany({
        where: {
          dueDate: { lt: today },
          isPaid: true,
        },
      });

      for (const expense of expensesToReset) {
        // eslint-disable-next-line prefer-const
        let newDueDate = new Date(expense.dueDate);
        if (expense.recurrence === 'MONTHLY') {
          newDueDate.setMonth(newDueDate.getMonth() + 1);
        } else if (expense.recurrence === 'YEARLY') {
          newDueDate.setFullYear(newDueDate.getFullYear() + 1);
        }

        await this.prisma.fixedExpense.update({
          where: { id: expense.id },
          data: {
            dueDate: newDueDate,
            isPaid: false,
          },
        });
      }
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Erro ao resetar as despesas fixas.',
      );
    }
  }

  // Função auxiliar para notificar se a despesa estiver próxima do vencimento
  private async checkDueDateAndNotify(expense: {
    dueDate: Date;
    isPaid: boolean;
    name: string;
    amount: number;
    userId: string;
  }) {
    try {
      const today = new Date();
      const diffDays = Math.ceil(
        (expense.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (!expense.isPaid && diffDays <= 3 && diffDays >= 0) {
        console.log(
          `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} vence em ${diffDays} dia(s).`,
        );
        // await this.notificationService.createNotification({
        //   title: 'Despesa Fixa Pendente',
        //   message: `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} vence em ${diffDays} dia(s).`,
        //   type: 'REMINDER',
        //   userId: expense.userId,
        // });
      }
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Erro ao verificar a data de vencimento e notificar.',
      );
    }
  }
}
