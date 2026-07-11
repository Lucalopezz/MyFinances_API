import { Injectable } from '@nestjs/common';
import { FixedExpense, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FixedExpenseRawFieldsService } from './fixed-expense-raw-fields.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/transaction-encryption.mapper';

@Injectable()
export class FixedExpensePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rawFieldsService: FixedExpenseRawFieldsService,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  async markAsPaid(expenseData: FixedExpense, userId: string) {
    if (expenseData.isPaid) {
      return expenseData;
    }

    const paidAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: buildEncryptedTransactionData(
          {
            value: expenseData.amount,
            date: paidAt,
            category: expenseData.category,
            description: `Despesa fixa: ${expenseData.name}`,
            type: TransactionType.EXPENSE,
            userId,
          },
          this.encryptionService,
        ) as never,
      });

      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id },
        data: { isPaid: true },
      });

      await this.rawFieldsService.setPaymentFields(
        tx,
        expenseData.id,
        paidAt,
        transaction.id,
      );

      return {
        ...expense,
        paidAt,
        paidTransactionId: transaction.id,
      };
    });
  }

  async unmarkAsPaid(expenseData: FixedExpense, userId: string) {
    if (!expenseData.isPaid) {
      return expenseData;
    }

    const paidTransactionId = await this.rawFieldsService.getPaidTransactionId(
      expenseData.id,
    );

    return this.prisma.$transaction(async (tx) => {
      if (paidTransactionId) {
        const linkedTransaction = await tx.transaction.findFirst({
          where: {
            id: paidTransactionId,
            userId,
          },
        });

        if (linkedTransaction) {
          await tx.transaction.delete({
            where: { id: linkedTransaction.id },
          });
        }
      }

      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id },
        data: { isPaid: false },
      });

      await this.rawFieldsService.clearPaymentFields(tx, expenseData.id);

      return {
        ...expense,
        paidAt: null,
        paidTransactionId: null,
      };
    });
  }
}
