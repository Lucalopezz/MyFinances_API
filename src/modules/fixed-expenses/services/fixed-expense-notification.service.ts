import { Injectable } from '@nestjs/common';
import { addDays, differenceInDays, startOfDay } from 'date-fns';
import { NotificationService } from 'src/modules/notification/notification.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { UpcomingExpenseToNotify } from '../types/fixed-expenses.types';

@Injectable()
export class FixedExpenseNotificationService {
  private readonly UPCOMING_NOTIFICATION_WINDOW_IN_DAYS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: FixedExpensesRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async processUpcomingDueNotifications(userId?: string) {
    try {
      const today = startOfDay(new Date());
      const deadline = addDays(
        today,
        this.UPCOMING_NOTIFICATION_WINDOW_IN_DAYS,
      );

      const upcomingExpenses =
        await this.repository.findUpcomingExpensesToNotify(
          today,
          deadline,
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

  private shouldNotifyExpense(expense: UpcomingExpenseToNotify) {
    const dueDateTime = startOfDay(new Date(expense.dueDate)).getTime();

    const lastNotifiedDueDateTime = expense.lastNotificationDueDate
      ? startOfDay(new Date(expense.lastNotificationDueDate)).getTime()
      : null;

    return lastNotifiedDueDateTime !== dueDateTime;
  }

  private async notifyUpcomingExpense(
    expense: UpcomingExpenseToNotify,
    today: Date,
  ) {
    const dueDate = startOfDay(new Date(expense.dueDate));
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
  }
}
