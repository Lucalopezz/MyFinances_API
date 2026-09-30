import { todayKey } from '../../calendar/calendar-calculation';
import { CategoriesService } from '../../categories/categories.service';
import { Injectable } from '@nestjs/common';
import { FixedExpense, TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/transaction-encryption.mapper';
import { FixedExpensePaymentsRepository } from '../repositories/fixed-expense-payments.repository';

@Injectable()
export class FixedExpensePaymentService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly repository: FixedExpensePaymentsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  async markAsPaid(expenseData: FixedExpense, userId: string) {
    if (expenseData.isPaid) {
      return expenseData;
    }

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

    const paidTransactionId = await this.repository.getPaidTransactionId(
      expenseData.id,
    );

    return this.repository.unmarkPaid(expenseData, userId, paidTransactionId);
  }
}
