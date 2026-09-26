import { Injectable } from '@nestjs/common';
import { FixedExpense, TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/transaction-encryption.mapper';
import { FixedExpensePaymentsRepository } from '../repositories/fixed-expense-payments.repository';

@Injectable()
export class FixedExpensePaymentService {
  constructor(
    private readonly repository: FixedExpensePaymentsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  async markAsPaid(expenseData: FixedExpense, userId: string) {
    if (expenseData.isPaid) {
      return expenseData;
    }

    const paidAt = new Date();

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
