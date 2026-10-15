import { nextExpenseDueDate } from '../domain/expense-recurrence';
import { Injectable } from '@nestjs/common';
import { todayKey } from 'src/common/date/civil-date';
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
    const nextDueDate = nextExpenseDueDate(
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
}
