import { Injectable } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { todayKey } from '../../calendar/calendar-calculation';
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
      // Never silently serve or mutate a stale paid cycle.
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
    // Advance one cycle only, retaining unpaid months and the original day 29/30/31.
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
