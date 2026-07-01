import { Injectable } from '@nestjs/common';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
  UpdateFixedExpensePaymentDto,
} from './dtos/fixed-expense.dto';
import { FixedExpenseErrorHandler } from './errors/fixed-expense-error.handler';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { FixedExpenseNotificationService } from './services/fixed-expense-notification.service';
import { FixedExpensePaymentService } from './services/fixed-expense-payment.service';
import { FixedExpenseRecurrenceService } from './services/fixed-expense-recurrence.service';

@Injectable()
export class FixedExpensesService {
  constructor(
    private readonly repository: FixedExpensesRepository,
    private readonly paymentService: FixedExpensePaymentService,
    private readonly recurrenceService: FixedExpenseRecurrenceService,
    private readonly notificationService: FixedExpenseNotificationService,
    private readonly errorHandler: FixedExpenseErrorHandler,
  ) {}

  async createFixedExpense(dto: CreateFixedExpenseDto, userId: string) {
    try {
      const expense = await this.repository.create(dto, userId);

      await this.notificationService.processUpcomingDueNotifications(userId);

      return expense;
    } catch (error) {
      this.errorHandler.handleCreateError(error, userId);
    }
  }

  async getFixedExpenses(userId: string) {
    try {
      await this.prepareFixedExpenses(userId);

      return this.repository.findManyByUser(userId);
    } catch (error) {
      this.errorHandler.handleUnexpected(
        error,
        'Erro ao buscar as despesas fixas.',
      );
    }
  }

  async getFixedExpense(id: string, userId: string) {
    try {
      await this.prepareFixedExpenses(userId);

      return this.repository.findByIdOrThrow(id, userId);
    } catch (error) {
      this.errorHandler.handleUnexpected(
        error,
        'Erro ao buscar a despesa fixa.',
      );
    }
  }

  async updateFixedExpense(
    id: string,
    dto: UpdateFixedExpenseDto,
    userId: string,
  ) {
    try {
      await this.recurrenceService.refreshRecurringExpenses(userId);

      const expense = await this.repository.findByIdOrThrow(id, userId);
      const updatedExpense = await this.repository.update(expense.id, dto);

      await this.notificationService.processUpcomingDueNotifications(userId);

      return updatedExpense;
    } catch (error) {
      this.errorHandler.handleFixedExpenseError(
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
      await this.recurrenceService.refreshRecurringExpenses(userId);

      const expense = await this.repository.findByIdOrThrow(id, userId);

      const updatedExpense = dto.isPaid
        ? await this.paymentService.markAsPaid(expense, userId)
        : await this.paymentService.unmarkAsPaid(expense, userId);

      await this.notificationService.processUpcomingDueNotifications(userId);

      return updatedExpense;
    } catch (error) {
      this.errorHandler.handleFixedExpenseError(
        error,
        id,
        'Erro ao atualizar o pagamento da despesa fixa.',
      );
    }
  }

  async deleteFixedExpense(id: string, userId: string) {
    try {
      await this.recurrenceService.refreshRecurringExpenses(userId);

      const expense = await this.repository.findByIdOrThrow(id, userId);

      return this.repository.delete(expense.id);
    } catch (error) {
      this.errorHandler.handleFixedExpenseError(
        error,
        id,
        'Erro ao excluir a despesa fixa.',
      );
    }
  }

  private async prepareFixedExpenses(userId: string) {
    await this.recurrenceService.refreshRecurringExpenses(userId);
    await this.notificationService.processUpcomingDueNotifications(userId);
  }
}
