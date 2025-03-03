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
import { addMonths, addYears, differenceInDays, startOfDay } from 'date-fns';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class FixedExpensesService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async createFixedExpense(dto: CreateFixedExpenseDto) {
    try {
      const dueDate = startOfDay(new Date(dto.dueDate));

      const expense = await this.prisma.fixedExpense.create({
        data: {
          name: dto.name,
          amount: dto.amount,
          dueDate,
          recurrence: dto.recurrence,
          isPaid: dto.isPaid || false,
          user: { connect: { id: '67c0b2bb3242fe3f7df1c069' } },
        },
      });

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

  @Cron(CronExpression.EVERY_DAY_AT_NOON) // Nova verificação diária ao meio-dia
  async checkDueDates() {
    try {
      const expenses = await this.prisma.fixedExpense.findMany({
        where: {
          userId: '67c0b2bb3242fe3f7df1c069',
          isPaid: false,
        },
      });

      for (const expense of expenses) {
        await this.checkDueDateAndNotify(expense);
      }
    } catch (error) {
      console.error('Erro na verificação diária de despesas:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetFixedExpenses() {
    try {
      const today = startOfDay(new Date());

      const expensesToReset = await this.prisma.fixedExpense.findMany({
        where: {
          dueDate: { lt: today },
          isPaid: true,
        },
      });

      for (const expense of expensesToReset) {
        let newDueDate = startOfDay(expense.dueDate);

        if (expense.recurrence === 'MONTHLY') {
          newDueDate = addMonths(newDueDate, 1);
        } else if (expense.recurrence === 'YEARLY') {
          newDueDate = addYears(newDueDate, 1);
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
      console.error('Erro ao resetar despesas:', error);
    }
  }

  private async checkDueDateAndNotify(expense: {
    dueDate: Date;
    isPaid: boolean;
    name: string;
    amount: number;
    userId: string;
  }) {
    try {
      const today = startOfDay(new Date());
      const dueDate = startOfDay(expense.dueDate);

      const daysUntilDue = differenceInDays(dueDate, today);

      if (daysUntilDue <= 3 && daysUntilDue >= 0) {
        console.log(`Notificando sobre a despesa ${expense.name}`);

        await this.notificationService.createNotification({
          title: 'Despesa Próxima do Vencimento',
          message: `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} vence em ${daysUntilDue} dias.`,
          userId: expense.userId,
          type: 'REMINDER',
        });
      }
    } catch (error) {
      console.error('Erro na verificação de vencimento:', error);
    }
  }
}
