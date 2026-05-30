import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RecurrenceType } from '@prisma/client';
import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  startOfDay,
} from 'date-fns';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from './dtos/fixed-expense.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class FixedExpensesService {
  private readonly upcomingNotificationWindowInDays = 3;

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async createFixedExpense(dto: CreateFixedExpenseDto, userId: string) {
    try {
      const dueDate = startOfDay(new Date(dto.dueDate));

      const expense = await this.prisma.fixedExpense.create({
        data: {
          name: dto.name,
          amount: dto.amount,
          dueDate,
          recurrence: dto.recurrence,
          isPaid: dto.isPaid ?? false,
          lastNotificationDueDate: null,
          user: { connect: { id: userId } },
        },
      });

      await this.processUpcomingDueNotifications(userId);

      return expense;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new InternalServerErrorException(
            'Já existe uma despesa fixa com esse nome.',
          );
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Usuário com ID "${userId}" não encontrado.`,
          );
        }
      }
      throw new InternalServerErrorException('Erro ao criar a despesa fixa.');
    }
  }

  async getFixedExpenses(userId: string) {
    try {
      await this.refreshRecurringExpenses(userId);
      await this.processUpcomingDueNotifications(userId);

      return this.prisma.fixedExpense.findMany({
        where: { userId },
        orderBy: { dueDate: 'asc' },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Erro ao buscar as despesas fixas.',
      );
    }
  }

  async getFixedExpense(id: string, userId: string) {
    try {
      await this.refreshRecurringExpenses(userId);
      await this.processUpcomingDueNotifications(userId);

      return await this.findFixedExpenseOrThrow(id, userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Erro ao buscar a despesa fixa.');
    }
  }

  async updateFixedExpense(
    id: string,
    dto: UpdateFixedExpenseDto,
    userId: string,
  ) {
    try {
      await this.refreshRecurringExpenses(userId);

      const expenseData = await this.findFixedExpenseOrThrow(id, userId);

      const expense = await this.prisma.fixedExpense.update({
        where: { id: expenseData.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.dueDate !== undefined
            ? { dueDate: startOfDay(new Date(dto.dueDate)) }
            : {}),
          ...(dto.recurrence !== undefined
            ? { recurrence: dto.recurrence }
            : {}),
          ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
        },
      });

      await this.processUpcomingDueNotifications(userId);

      return expense;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

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

  async deleteFixedExpense(id: string, userId: string) {
    try {
      await this.refreshRecurringExpenses(userId);

      const expenseData = await this.findFixedExpenseOrThrow(id, userId);

      return await this.prisma.fixedExpense.delete({
        where: { id: expenseData.id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

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

  private async refreshRecurringExpenses(userId?: string) {
    try {
      const today = startOfDay(new Date());

      const expensesToRefresh = await this.prisma.fixedExpense.findMany({
        where: {
          ...(userId ? { userId } : {}),
          isPaid: true,
          dueDate: { lt: today },
          recurrence: {
            in: [RecurrenceType.MONTHLY, RecurrenceType.YEARLY],
          },
        },
        select: {
          id: true,
          dueDate: true,
          recurrence: true,
        },
      });

      await Promise.all(
        expensesToRefresh.map(async (expense) => {
          const nextDueDate = this.calculateNextDueDate(
            expense.dueDate,
            expense.recurrence,
            today,
          );

          await this.prisma.fixedExpense.update({
            where: { id: expense.id },
            data: {
              dueDate: nextDueDate,
              isPaid: false,
              lastNotificationDueDate: null,
            },
          });
        }),
      );
    } catch (error) {
      console.error('Erro ao atualizar despesas recorrentes:', error);
    }
  }

  private async processUpcomingDueNotifications(userId?: string) {
    try {
      const today = startOfDay(new Date());
      const notificationDeadline = addDays(
        today,
        this.upcomingNotificationWindowInDays,
      );

      const upcomingExpenses = await this.prisma.fixedExpense.findMany({
        where: {
          ...(userId ? { userId } : {}),
          isPaid: false,
          dueDate: {
            gte: today,
            lte: notificationDeadline,
          },
        },
        select: {
          id: true,
          name: true,
          amount: true,
          dueDate: true,
          userId: true,
          lastNotificationDueDate: true,
        },
      });

      const expensesToNotify = upcomingExpenses.filter((expense) => {
        const dueDate = startOfDay(expense.dueDate).getTime();
        const lastNotifiedDueDate = expense.lastNotificationDueDate
          ? startOfDay(expense.lastNotificationDueDate).getTime()
          : null;

        return lastNotifiedDueDate !== dueDate;
      });

      await Promise.all(
        expensesToNotify.map(async (expense) => {
          const dueDate = startOfDay(expense.dueDate);
          const daysUntilDue = differenceInDays(dueDate, today);

          await this.notificationService.createNotification({
            title: 'Despesa Próxima do Vencimento',
            message: `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} vence em ${daysUntilDue} dias.`,
            userId: expense.userId,
            type: 'REMINDER',
          });

          await this.prisma.fixedExpense.update({
            where: { id: expense.id },
            data: {
              lastNotificationDueDate: dueDate,
            },
          });
        }),
      );
    } catch (error) {
      console.error('Erro ao processar notificações de vencimento:', error);
    }
  }

  // Calcula a próxima data de vencimento com base na data original, tipo de recorrência e data de referência
  // Garante que a próxima data de vencimento seja sempre no futuro em relação à data de referência
  private calculateNextDueDate(
    dueDate: Date,
    recurrence: RecurrenceType,
    referenceDate: Date,
  ) {
    let nextDueDate = startOfDay(dueDate);
    const normalizedReferenceDate = startOfDay(referenceDate);

    while (nextDueDate < normalizedReferenceDate) {
      nextDueDate =
        recurrence === RecurrenceType.MONTHLY
          ? addMonths(nextDueDate, 1)
          : addYears(nextDueDate, 1);
    }

    return nextDueDate;
  }

  private async findFixedExpenseOrThrow(id: string, userId: string) {
    const expense = await this.prisma.fixedExpense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      throw new NotFoundException(
        `Despesa fixa com ID "${id}" não encontrada.`,
      );
    }

    return expense;
  }
}
