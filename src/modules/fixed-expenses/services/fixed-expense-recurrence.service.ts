import { Injectable } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { addMonths, addYears, startOfDay } from 'date-fns';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { RecurringExpenseToRefresh } from '../types/fixed-expenses.types';
import { FixedExpenseRawFieldsService } from './fixed-expense-raw-fields.service';

@Injectable()
export class FixedExpenseRecurrenceService {
  constructor(
    private readonly repository: FixedExpensesRepository,
    private readonly rawFieldsService: FixedExpenseRawFieldsService,
  ) {}

  async refreshRecurringExpenses(userId?: string) {
    try {
      const today = startOfDay(new Date());

      const expensesToRefresh =
        await this.repository.findRecurringExpensesToRefresh(today, userId);

      await Promise.all(
        expensesToRefresh.map((expense) =>
          this.refreshRecurringExpense(expense, today),
        ),
      );
    } catch (error) {
      console.error('Erro ao atualizar despesas recorrentes:', error);
    }
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

    await this.repository.refreshCycle(expense.id, nextDueDate);
    await this.rawFieldsService.clearPaymentFieldsForExpense(expense.id);
  }

  private calculateNextDueDate(
    dueDate: Date,
    recurrence: RecurrenceType,
    referenceDate: Date,
  ) {
    let nextDueDate = startOfDay(new Date(dueDate));
    const normalizedReferenceDate = startOfDay(new Date(referenceDate));

    while (nextDueDate < normalizedReferenceDate) {
      nextDueDate =
        recurrence === RecurrenceType.MONTHLY
          ? addMonths(nextDueDate, 1)
          : addYears(nextDueDate, 1);
    }

    return nextDueDate;
  }
}
