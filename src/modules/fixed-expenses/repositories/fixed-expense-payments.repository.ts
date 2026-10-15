import { ConflictException, Injectable } from '@nestjs/common';
import { FixedExpense, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
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

  /** Permite compor a contratação no cartão sem abrir um segundo commit financeiro. */
  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.runPaymentTransaction(callback);
  }

  findExpense(tx: Prisma.TransactionClient, userId: string, id: string) {
    return tx.fixedExpense.findFirst({ where: { id, userId } });
  }

  /** Só uma chamada pode contratar esta competência, inclusive em abas concorrentes. */
  async claimCardCharge(
    tx: Prisma.TransactionClient,
    userId: string,
    expense: FixedExpense,
  ) {
    const claimed = await tx.fixedExpense.updateMany({
      where: {
        id: expense.id,
        userId,
        dueDate: expense.dueDate,
        isPaid: false,
      },
      data: { isPaid: true },
    });
    if (!claimed.count)
      throw new ConflictException('A despesa mudou. Atualize a página.');
  }

  /** Guarda os dois lados do vínculo na mesma transação que criou compra e parcelas. */
  async linkCardCharge(
    tx: Prisma.TransactionClient,
    userId: string,
    expense: FixedExpense,
    purchaseId: string,
  ) {
    await tx.cardPurchase.update({
      where: { id: purchaseId, userId },
      data: {
        fixedExpenseId: expense.id,
        fixedExpenseDueDate: expense.dueDate,
      },
    });
    return tx.fixedExpense.update({
      where: { id: expense.id, userId },
      data: { paidAt: new Date(), paidCardPurchaseId: purchaseId },
    });
  }

  /** Grava estado pago, lançamento, resolução dos avisos e recibo como uma única operação. */
  markPaid(
    expenseData: FixedExpense,
    userId: string,
    paidAt: Date,
    encryptedTransactionData: Record<string, unknown>,
    encryptedReceipt: (transactionId: string) => string,
  ) {
    return this.runPaymentTransaction(async (tx) => {
      // O teste e a mudança de estado são uma única escrita: só uma chamada pode
      // pagar este vencimento. Verificar apenas isPaid no service permitiria uma corrida.
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
      // O pagamento resolve os avisos do ciclo na mesma transação financeira.
      // O histórico permanece disponível, mas deixa de contar como pendência.
      await tx.notification.updateMany({
        where: {
          userId,
          sourceExpenseId: expenseData.id,
          dueDateKey: expenseData.dueDate.toISOString().slice(0, 10),
          OR: [{ resolvedAt: null }, { resolvedAt: { isSet: false } }],
        },
        data: { resolvedAt: new Date(), resolution: 'PAID', read: true },
      });
      // A competência identifica o mês/ano realizado no calendário, mesmo após o
      // avanço da recorrência; sem esse recibo a previsão poderia ser contada de novo.
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

  /** Remove lançamento e recibo junto com a marcação; falhas desfazem a operação inteira. */
  unmarkPaid(
    expenseData: FixedExpense,
    userId: string,
    paidTransactionId: string | null,
  ) {
    return this.runPaymentTransaction(async (tx) => {
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

  /** Reavalia conflitos com a sincronização sem repetir um pagamento já confirmado. */
  private async runPaymentTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(callback);
      } catch (error) {
        // Só o conflito de transação garante rollback; demais erros não são repetidos.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new Error('Não foi possível registrar o pagamento.');
  }
}
