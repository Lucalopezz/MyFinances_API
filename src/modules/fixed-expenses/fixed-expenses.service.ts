import { BadRequestException } from '@nestjs/common';
import { CardsService } from '../cards/cards.service';
import { CategoriesService } from '../categories/categories.service';
import { Injectable } from '@nestjs/common';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
  UpdateFixedExpensePaymentDto,
} from './dto/fixed-expense.dto';
import { FixedExpenseErrorHandler } from './errors/fixed-expense-error.handler';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { FixedExpenseNotificationService } from './services/fixed-expense-notification.service';
import { FixedExpensePaymentService } from './services/fixed-expense-payment.service';
import { FixedExpenseRecurrenceService } from './services/fixed-expense-recurrence.service';

@Injectable()
export class FixedExpensesService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: FixedExpensesRepository,
    private readonly paymentService: FixedExpensePaymentService,
    private readonly recurrenceService: FixedExpenseRecurrenceService,
    private readonly notificationService: FixedExpenseNotificationService,
    private readonly errorHandler: FixedExpenseErrorHandler,
    private readonly cards: CardsService,
  ) {}

  async createFixedExpense(dto: CreateFixedExpenseDto, userId: string) {
    await this.categories.resolveReference(dto.category, userId, 'EXPENSE');
    await this.validateCard(userId, dto.cardId);
    if (
      dto.cardId &&
      Math.round(dto.amount * 100) < (dto.cardInstallments ?? 1)
    )
      throw new BadRequestException(
        'O valor deve permitir parcelas de pelo menos um centavo.',
      );
    try {
      const expense = await this.repository.create(dto, userId);

      await this.notificationService.processDueNotifications(userId);

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
      await this.categories.resolveReference(
        dto.category ?? expense.category,
        userId,
        'EXPENSE',
        !dto.category || dto.category === expense.category,
      );
      if (dto.cardId && dto.cardId !== expense.cardId)
        await this.validateCard(userId, dto.cardId);
      const paymentCardId =
        dto.cardId === undefined ? expense.cardId : dto.cardId;
      if (
        paymentCardId &&
        Math.round((dto.amount ?? expense.amount) * 100) <
          (dto.cardInstallments ?? expense.cardInstallments ?? 1)
      )
        throw new BadRequestException(
          'O valor deve permitir parcelas de pelo menos um centavo.',
        );
      if (
        expense.isPaid &&
        ((dto.cardId !== undefined && dto.cardId !== expense.cardId) ||
          (dto.cardInstallments !== undefined &&
            dto.cardInstallments !== (expense.cardInstallments ?? 1)))
      )
        throw new BadRequestException(
          'A contratação já foi registrada. Aguarde a próxima renovação ou estorne a compra para alterar o pagamento.',
        );
      const updatedExpense = await this.repository.update(expense.id, dto);

      await this.notificationService.processDueNotifications(userId);

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

      await this.notificationService.processDueNotifications(userId);

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

      const deleted = await this.repository.delete(expense.id);
      // A despesa removida encerra seus avisos, mantendo o histórico no sininho.
      await this.notificationService.processDueNotifications(userId);
      return deleted;
    } catch (error) {
      this.errorHandler.handleFixedExpenseError(
        error,
        id,
        'Erro ao excluir a despesa fixa.',
      );
    }
  }

  /** Impede vínculos com cartões de outro usuário ou já arquivados. */
  private async validateCard(userId: string, cardId?: string | null) {
    if (!cardId) return;
    const card = await this.cards.detail(userId, cardId);
    if (card.archived)
      throw new BadRequestException(
        'Este cartão está arquivado. Escolha outro cartão.',
      );
  }

  private async prepareFixedExpenses(userId: string) {
    await this.recurrenceService.refreshRecurringExpenses(userId);
    // Leituras respeitam o intervalo compartilhado; mutações usam force=true.
    await this.notificationService.processDueNotifications(userId, false);
  }
}
