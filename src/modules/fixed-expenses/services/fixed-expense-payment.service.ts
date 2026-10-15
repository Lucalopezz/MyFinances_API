import { todayKey } from 'src/common/date/civil-date';
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

  /**
   * Confirma o ciclo atual: pagamento direto gera despesa e recibo; no cartão gera compra.
   * O repository mantém a alteração da despesa e seus vínculos na mesma transação de banco.
   */
  async markAsPaid(expenseData: FixedExpense, userId: string) {
    if (expenseData.isPaid) {
      return expenseData;
    }

    // Registrar no cartão cria compromisso; a despesa realizada nasce ao pagar a fatura.
    if (expenseData.cardId && this.cards)
      return this.chargeCardExpense(userId, expenseData.id);

    await this.categories.resolveReference(
      expenseData.category,
      userId,
      'EXPENSE',
    );
    // Meio-dia UTC preserva o dia civil de São Paulo ao converter a data para exibição;
    // meia-noite UTC apareceria como o dia anterior nesse fuso.
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
    // O recibo guarda os dados deste ciclo mesmo que nome, valor ou vencimento mudem.
    // A função recebe o ID da transação recém-criada para registrar o vínculo correto.
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

  /** Coordena a contratação recorrente: compra, parcelas e competência confirmam juntas. */
  async chargeCardExpense(userId: string, expenseId: string) {
    return this.repository.transaction(async (tx) => {
      const expense = await this.repository.findExpense(tx, userId, expenseId);
      if (!expense?.cardId || !this.cards)
        throw new BadRequestException('Selecione um cartão para esta despesa.');
      if (expense.isPaid) return expense;
      await this.repository.claimCardCharge(tx, userId, expense);
      const purchase = await this.cards.createPurchase(
        userId,
        expense.cardId,
        {
          description: `Despesa fixa: ${expense.name}`,
          amount: expense.amount,
          date: todayKey(),
          category: expense.category,
          installments: expense.cardInstallments ?? 1,
        },
        tx,
      );
      // O contexto tx atravessa CardsService: falha de limite desfaz também o claim.
      return this.repository.linkCardCharge(tx, userId, expense, purchase.id);
    });
  }

  /** Desfaz o pagamento direto; compras no cartão exigem o estorno específico desse domínio. */
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
