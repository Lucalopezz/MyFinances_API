import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  FixedExpense,
  Prisma,
  RecurrenceType,
  TransactionType,
} from '@prisma/client';
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
  UpdateFixedExpensePaymentDto,
  UpdateFixedExpenseDto,
} from './dtos/fixed-expense.dto';
import { NotificationService } from '../notification/notification.service';

type FixedExpenseClient = PrismaService | Prisma.TransactionClient;
type RecurringExpenseToRefresh = Prisma.FixedExpenseGetPayload<{
  select: {
    id: true;
    dueDate: true;
    recurrence: true;
  };
}>;
type UpcomingExpenseToNotify = Prisma.FixedExpenseGetPayload<{
  select: {
    id: true;
    name: true;
    amount: true;
    dueDate: true;
    userId: true;
    lastNotificationDueDate: true;
  };
}>;

@Injectable()
export class FixedExpensesService {
  private readonly UPCOMING_NOTIFICATION_WINDOW_IN_DAYS = 3;

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async createFixedExpense(dto: CreateFixedExpenseDto, userId: string) {
    try {
      const expense = await this.createExpense(dto, userId);

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
      await this.prepareFixedExpenses(userId);

      return this.findFixedExpensesByUser(userId);
    } catch (error) {
      this.handleUnexpectedError(error, 'Erro ao buscar as despesas fixas.');
    }
  }

  async getFixedExpense(id: string, userId: string) {
    try {
      await this.prepareFixedExpenses(userId);

      return this.findFixedExpenseOrThrow(id, userId);
    } catch (error) {
      this.handleUnexpectedError(error, 'Erro ao buscar a despesa fixa.');
    }
  }

  async updateFixedExpense(
    id: string,
    dto: UpdateFixedExpenseDto,
    userId: string,
  ) {
    try {
      await this.refreshRecurringExpenses(userId);

      const expense = await this.findFixedExpenseOrThrow(id, userId);
      const updatedExpense = await this.updateExpense(expense.id, dto);

      await this.processUpcomingDueNotifications(userId);

      return updatedExpense;
    } catch (error) {
      this.handleFixedExpenseError(
        error,
        id,
        'Erro ao atualizar a despesa fixa.',
      );
    }
  }

  async updateFixedExpensePayment(
    id: string,
    dto: UpdateFixedExpensePaymentDto,
    userId: string,
  ) {
    try {
      await this.refreshRecurringExpenses(userId);
      const expense = await this.findFixedExpenseOrThrow(id, userId);

      const updatedExpense = dto.isPaid
        ? await this.markFixedExpenseAsPaid(expense, userId)
        : await this.unmarkFixedExpenseAsPaid(expense, userId);

      await this.processUpcomingDueNotifications(userId);

      return updatedExpense;
    } catch (error) {
      this.handleFixedExpenseError(
        error,
        id,
        'Erro ao atualizar o pagamento da despesa fixa.',
      );
    }
  }

  async deleteFixedExpense(id: string, userId: string) {
    try {
      await this.refreshRecurringExpenses(userId);

      const expense = await this.findFixedExpenseOrThrow(id, userId);

      return this.deleteExpense(expense.id);
    } catch (error) {
      this.handleFixedExpenseError(
        error,
        id,
        'Erro ao excluir a despesa fixa.',
      );
    }
  }

  private createExpense(dto: CreateFixedExpenseDto, userId: string) {
    return this.prisma.fixedExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dueDate: this.normalizeDate(dto.dueDate),
        recurrence: dto.recurrence,
        isPaid: false,
        lastNotificationDueDate: null,
        userId,
      },
    });
  }

  private updateExpense(id: string, dto: UpdateFixedExpenseDto) {
    return this.prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: this.normalizeDate(dto.dueDate) }
          : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
      },
    });
  }

  private async prepareFixedExpenses(userId: string) {
    await this.refreshRecurringExpenses(userId);
    await this.processUpcomingDueNotifications(userId);
  }

  private findFixedExpensesByUser(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
    });
  }

  private async markFixedExpenseAsPaid(
    expenseData: FixedExpense,
    userId: string,
  ) {
    if (expenseData.isPaid) {
      return expenseData;
    }

    const paidAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          value: expenseData.amount,
          date: paidAt,
          category: 'OTHER',
          description: `Despesa fixa: ${expenseData.name}`,
          type: TransactionType.EXPENSE,
          userId,
        },
      });

      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id },
        data: { isPaid: true },
      });

      await this.setFixedExpensePaymentFields(
        tx,
        expenseData.id,
        paidAt,
        transaction.id,
      );

      return {
        ...expense,
        paidAt,
        paidTransactionId: transaction.id,
      };
    });
  }

  private async unmarkFixedExpenseAsPaid(
    expenseData: FixedExpense,
    userId: string,
  ) {
    if (!expenseData.isPaid) {
      return expenseData;
    }

    const paidTransactionId = await this.getPaidTransactionId(expenseData.id);

    return this.prisma.$transaction(async (tx) => {
      await this.deletePaidTransactionIfExists(tx, paidTransactionId, userId);

      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id },
        data: { isPaid: false },
      });

      await this.clearFixedExpensePaymentFields(tx, expenseData.id);

      return {
        ...expense,
        paidAt: null,
        paidTransactionId: null,
      };
    });
  }

  private async deletePaidTransactionIfExists(
    client: FixedExpenseClient,
    paidTransactionId: string | null,
    userId: string,
  ) {
    if (!paidTransactionId) {
      return;
    }

    const linkedTransaction = await client.transaction.findFirst({
      where: {
        id: paidTransactionId,
        userId,
      },
    });

    if (linkedTransaction) {
      await client.transaction.delete({
        where: { id: linkedTransaction.id },
      });
    }
  }

  private deleteExpense(id: string) {
    return this.prisma.fixedExpense.delete({
      where: { id },
    });
  }

  private async refreshRecurringExpenses(userId?: string) {
    try {
      const today = startOfDay(new Date());
      const expensesToRefresh = await this.findRecurringExpensesToRefresh(
        today,
        userId,
      );

      await Promise.all(
        expensesToRefresh.map((expense) =>
          this.refreshRecurringExpense(expense, today),
        ),
      );
    } catch (error) {
      console.error('Erro ao atualizar despesas recorrentes:', error);
    }
  }

  private async processUpcomingDueNotifications(userId?: string) {
    try {
      const today = startOfDay(new Date());
      const upcomingExpenses = await this.findUpcomingExpensesToNotify(
        today,
        userId,
      );
      const expensesToNotify = upcomingExpenses.filter((expense) =>
        this.shouldNotifyExpense(expense),
      );

      await Promise.all(
        expensesToNotify.map((expense) =>
          this.notifyUpcomingExpense(expense, today),
        ),
      );
    } catch (error) {
      console.error('Erro ao processar notificações de vencimento:', error);
    }
  }

  private findRecurringExpensesToRefresh(today: Date, userId?: string) {
    return this.prisma.fixedExpense.findMany({
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
  }

  private async refreshRecurringExpense(
    expense: RecurringExpenseToRefresh,
    today: Date,
  ) {
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

    await this.clearFixedExpensePaymentFields(this.prisma, expense.id);
  }

  private findUpcomingExpensesToNotify(today: Date, userId?: string) {
    return this.prisma.fixedExpense.findMany({
      where: {
        ...(userId ? { userId } : {}),
        isPaid: false,
        dueDate: {
          gte: today,
          lte: this.getNotificationDeadline(today),
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
  }

  private shouldNotifyExpense(expense: UpcomingExpenseToNotify) {
    const dueDateTime = this.normalizeDate(expense.dueDate).getTime();
    const lastNotifiedDueDateTime = expense.lastNotificationDueDate
      ? this.normalizeDate(expense.lastNotificationDueDate).getTime()
      : null;

    return lastNotifiedDueDateTime !== dueDateTime;
  }

  private async notifyUpcomingExpense(
    expense: UpcomingExpenseToNotify,
    today: Date,
  ) {
    const dueDate = this.normalizeDate(expense.dueDate);
    const daysUntilDue = differenceInDays(dueDate, today);

    await this.notificationService.createNotification({
      title: 'Despesa Próxima do Vencimento',
      message: `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} vence em ${daysUntilDue} dias.`,
      userId: expense.userId,
      type: 'REMINDER',
    });

    await this.updateLastNotificationDueDate(expense.id, dueDate);
  }

  private updateLastNotificationDueDate(id: string, dueDate: Date) {
    return this.prisma.fixedExpense.update({
      where: { id },
      data: {
        lastNotificationDueDate: dueDate,
      },
    });
  }

  private getNotificationDeadline(today: Date) {
    return addDays(today, this.UPCOMING_NOTIFICATION_WINDOW_IN_DAYS);
  }

  private calculateNextDueDate(
    dueDate: Date,
    recurrence: RecurrenceType,
    referenceDate: Date,
  ) {
    let nextDueDate = this.normalizeDate(dueDate);
    const normalizedReferenceDate = this.normalizeDate(referenceDate);

    while (nextDueDate < normalizedReferenceDate) {
      nextDueDate =
        recurrence === RecurrenceType.MONTHLY
          ? addMonths(nextDueDate, 1)
          : addYears(nextDueDate, 1);
    }

    return nextDueDate;
  }

  private normalizeDate(date: Date) {
    return startOfDay(new Date(date));
  }

  private async getPaidTransactionId(id: string) {
    const result = (await this.prisma.fixedExpense.findRaw({
      filter: {
        _id: { $oid: id },
      },
      options: {
        projection: {
          paidTransactionId: 1,
        },
      },
    })) as unknown as Array<{
      paidTransactionId?: string;
    }>;

    return result[0]?.paidTransactionId ?? null;
  }

  private async setFixedExpensePaymentFields(
    client: FixedExpenseClient,
    id: string,
    paidAt: Date,
    paidTransactionId: string,
  ) {
    await client.$runCommandRaw({
      update: 'FixedExpense',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $set: {
              paidAt: { $date: paidAt.toISOString() },
              paidTransactionId,
            },
          },
          multi: false,
        },
      ],
    });
  }

  private async clearFixedExpensePaymentFields(
    client: FixedExpenseClient,
    id: string,
  ) {
    await client.$runCommandRaw({
      update: 'FixedExpense',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $unset: {
              paidAt: '',
              paidTransactionId: '',
            },
          },
          multi: false,
        },
      ],
    });
  }

  private handleFixedExpenseError(
    error: unknown,
    id: string,
    fallbackMessage: string,
  ): never {
    if (error instanceof NotFoundException) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException(
        `Despesa fixa com ID "${id}" não encontrada.`,
      );
    }

    throw new InternalServerErrorException(fallbackMessage);
  }

  private handleUnexpectedError(
    error: unknown,
    fallbackMessage: string,
  ): never {
    if (error instanceof NotFoundException) {
      throw error;
    }

    throw new InternalServerErrorException(fallbackMessage);
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
