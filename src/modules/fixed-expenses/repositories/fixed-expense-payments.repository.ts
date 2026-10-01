import { ConflictException, Injectable } from '@nestjs/common';
import { FixedExpense } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FixedExpenseRawFieldsService } from '../services/fixed-expense-raw-fields.service';

@Injectable()
export class FixedExpensePaymentsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rawFieldsService: FixedExpenseRawFieldsService,
  ) {}

  getPaidTransactionId(id: string) {
    return this.rawFieldsService.getPaidTransactionId(id);
  }

  markPaid(
    expenseData: FixedExpense,
    userId: string,
    paidAt: Date,
    encryptedTransactionData: Record<string, unknown>,
    encryptedReceipt: (transactionId: string) => string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.fixedExpense.updateMany({
        where: {
          id: expenseData.id,
          userId,
          isPaid: false,
          dueDate: expenseData.dueDate,
        },
        data: { isPaid: true },
      });
      if (!claimed.count)
        throw new ConflictException(
          'Pagamento já registrado ou ciclo alterado. Atualize a página.',
        );
      const transaction = await tx.transaction.create({
        data: encryptedTransactionData as never,
      });
      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id, userId },
        data: { isPaid: true },
      });
      await this.rawFieldsService.setPaymentFields(
        tx,
        expenseData.id,
        paidAt,
        transaction.id,
      );
      await tx.calendarReceipt.create({
        data: {
          userId,
          sourceId: expenseData.id,
          dueDate: expenseData.dueDate.toISOString().slice(0, 10),
          periodKey: `${expenseData.recurrence}:${expenseData.dueDate.toISOString().slice(0, expenseData.recurrence === 'MONTHLY' ? 7 : 4)}`,
          type: 'EXPENSE',
          transactionId: transaction.id,
          encryptedData: encryptedReceipt(transaction.id),
        },
      });
      return { ...expense, paidAt, paidTransactionId: transaction.id };
    });
  }

  unmarkPaid(
    expenseData: FixedExpense,
    userId: string,
    paidTransactionId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (paidTransactionId) {
        const linkedTransaction = await tx.transaction.findFirst({
          where: { id: paidTransactionId, userId },
        });
        if (linkedTransaction) {
          await tx.transaction.delete({
            where: { id: linkedTransaction.id, userId },
          });
        }
      }
      await tx.calendarReceipt.deleteMany({
        where: {
          userId,
          sourceId: expenseData.id,
          transactionId: paidTransactionId ?? '000000000000000000000000',
        },
      });
      const expense = await tx.fixedExpense.update({
        where: { id: expenseData.id, userId },
        data: { isPaid: false },
      });
      await this.rawFieldsService.clearPaymentFields(tx, expenseData.id);
      return { ...expense, paidAt: null, paidTransactionId: null };
    });
  }
}
