import { FixedExpensePaymentService } from './fixed-expense-payment.service';
import { FixedExpensePaymentsRepository } from '../repositories/fixed-expense-payments.repository';

describe('FixedExpensePaymentService', () => {
  it('creates and removes only the linked user transaction inside database transactions', async () => {
    const userId = '64f000000000000000000001';
    const expenseId = '64f000000000000000000030';
    const transactionId = '64f000000000000000000010';
    const expense = {
      id: expenseId,
      userId,
      name: 'Aluguel',
      amount: 100,
      category: 'HOUSING',
      isPaid: false,
    };
    const tx = {
      transaction: {
        create: jest.fn(async () => ({ id: transactionId })),
        findFirst: jest.fn(async () => ({ id: transactionId })),
        delete: jest.fn(async () => ({ id: transactionId })),
      },
      fixedExpense: {
        update: jest.fn(async ({ data }) => ({ ...expense, ...data })),
      },
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) };
    const rawFields = {
      getPaidTransactionId: jest.fn(async () => transactionId),
      setPaymentFields: jest.fn(async () => undefined),
      clearPaymentFields: jest.fn(async () => undefined),
    };
    const service = new FixedExpensePaymentService(
      new FixedExpensePaymentsRepository(prisma as never, rawFields as never),
      { encrypt: (value: unknown) => JSON.stringify(value) } as never,
    );

    const paid = await service.markAsPaid(expense as never, userId);
    expect(paid).toMatchObject({
      isPaid: true,
      paidTransactionId: transactionId,
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        type: 'EXPENSE',
        dateIndex: expect.any(Number),
      }),
    });
    expect(tx.fixedExpense.update).toHaveBeenCalledWith({
      where: { id: expenseId, userId },
      data: { isPaid: true },
    });
    expect(rawFields.setPaymentFields).toHaveBeenCalledWith(
      tx,
      expenseId,
      expect.any(Date),
      transactionId,
    );

    const unpaid = await service.unmarkAsPaid(
      { ...expense, isPaid: true } as never,
      userId,
    );
    expect(unpaid).toMatchObject({ isPaid: false, paidTransactionId: null });
    expect(tx.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: transactionId, userId },
    });
    expect(tx.transaction.delete).toHaveBeenCalledWith({
      where: { id: transactionId, userId },
    });
    expect(rawFields.clearPaymentFields).toHaveBeenCalledWith(tx, expenseId);
  });
});
