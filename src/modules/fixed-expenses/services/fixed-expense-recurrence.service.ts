import { Injectable } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { todayKey } from '../../calendar/domain/calendar-calculation';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { RecurringExpenseToRefresh } from '../types/fixed-expenses.types';

@Injectable()
export class FixedExpenseRecurrenceService {
  constructor(private readonly repository: FixedExpensesRepository) {}

  async refreshRecurringExpenses(userId?: string) {
    try {
      const today = new Date(`${todayKey()}T00:00:00Z`);

      const expensesToRefresh =
        await this.repository.findRecurringExpensesToRefresh(today, userId);

      await Promise.all(
        expensesToRefresh.map((expense) =>
          this.refreshRecurringExpense(expense),
        ),
      );
    } catch (error) {
      // Não retorna nem altera silenciosamente um ciclo pago desatualizado.
      throw error;
    }
  }

  private async refreshRecurringExpense(expense: RecurringExpenseToRefresh) {
    const nextDueDate = this.calculateNextDueDate(
      expense.dueDate,
      expense.recurrence,
      expense.recurrenceDay ?? expense.dueDate.getUTCDate(),
    );

    await this.repository.refreshCycle(
      expense.id,
      nextDueDate,
      expense.dueDate,
    );
  }

  private calculateNextDueDate(
    dueDate: Date,
    recurrence: RecurrenceType,
    anchorDay: number,
  ) {
    // Avança apenas um ciclo, preservando meses não pagos e o dia original 29/30/31.
    const month =
      dueDate.getUTCMonth() + (recurrence === RecurrenceType.MONTHLY ? 1 : 12);
    const first = new Date(Date.UTC(dueDate.getUTCFullYear(), month, 1));
    const last = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(anchorDay, last),
        12,
      ),
    );
  }
}
