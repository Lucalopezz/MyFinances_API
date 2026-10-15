import { todayKey } from '../../calendar/domain/calendar-calculation';
import { CategoriesService } from '../../categories/categories.service';
import { CardsService } from '../../cards/cards.service';
import { Injectable, BadRequestException } from '@nestjs/common';
import { FixedExpense, TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/mappers/transaction-encryption.mapper';
import { FixedExpensePaymentsRepository } from '../repositories/fixed-expense-payments.repository';

@Injectable()
export class FixedExpensePaymentService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: FixedExpensePaymentsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
    private readonly cards?: CardsService,
  ) {}

  async markAsPaid(expenseData: FixedExpense, userId: string) {
    if (expenseData.isPaid) {
      return expenseData;
    }

    // Registrar no cartão cria compromisso; a despesa realizada nasce ao pagar a fatura.
    if (expenseData.cardId && this.cards)
      return this.cards.chargeFixedExpense(userId, expenseData.id);

    await this.categories.resolveReference(
      expenseData.category,
      userId,
      'EXPENSE',
    );
    const paidAt = new Date(`${todayKey()}T12:00:00Z`);

    const encryptedTransactionData = buildEncryptedTransactionData(
      {
        value: expenseData.amount,
        date: paidAt,
        category: expenseData.category,
        description: `Despesa fixa: ${expenseData.name}`,
        type: TransactionType.EXPENSE,
        userId,
      },
      this.encryptionService,
    );
    return this.repository.markPaid(
      expenseData,
      userId,
      paidAt,
      encryptedTransactionData,
      (transactionId) =>
        this.encryptionService.encrypt({
          id: `${expenseData.id}:${expenseData.dueDate.toISOString().slice(0, 10)}`,
          sourceId: expenseData.id,
          dueDate: expenseData.dueDate.toISOString().slice(0, 10),
          description: expenseData.name,
          amount: expenseData.amount,
          category: expenseData.category,
          periodKey: `${expenseData.recurrence}:${expenseData.dueDate.toISOString().slice(0, expenseData.recurrence === 'MONTHLY' ? 7 : 4)}`,
          type: 'EXPENSE',
          status: 'SETTLED',
          actualDate: paidAt.toISOString().slice(0, 10),
          actualAmount: expenseData.amount,
          transactionId,
        }),
    );
  }

  async unmarkAsPaid(expenseData: FixedExpense, userId: string) {
    if (!expenseData.isPaid) {
      return expenseData;
    }

    if (expenseData.paidCardPurchaseId)
      throw new BadRequestException(
        'Estorne a compra na tela de cartões para desfazer esta contratação.',
      );

    const paidTransactionId = await this.repository.getPaidTransactionId(
      expenseData.id,
    );

    return this.repository.unmarkPaid(expenseData, userId, paidTransactionId);
  }
}
