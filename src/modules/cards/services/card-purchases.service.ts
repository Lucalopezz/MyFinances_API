import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayKey } from 'src/common/date/civil-date';
import { fromCents } from 'src/common/money/money';
import { CategoriesService } from '../../categories/categories.service';
import {
  paidRefundCents,
  planPurchase,
  validatePurchase,
} from '../domain/card-rules';
import { CardEncryptionMapper } from '../mappers/card-encryption.mapper';
import { CardsRepository } from '../repositories/cards.repository';
import { NewPurchase } from '../types/cards.types';
import { cardRule, checkCardId } from './card-validation';

/** Coordena compras e estornos; parcelas, lançamentos e vínculos compartilham o mesmo commit. */
@Injectable()
export class CardPurchasesService {
  constructor(
    private readonly repository: CardsRepository,
    private readonly mapper: CardEncryptionMapper,
    private readonly categories: CategoriesService,
  ) {}

  async createPurchase(
    userId: string,
    id: string,
    input: NewPurchase,
    client?: Prisma.TransactionClient,
  ) {
    checkCardId(id);
    cardRule(() => validatePurchase(input, todayKey()));
    await this.categories.resolveReference(input.category, userId, 'EXPENSE');
    return this.repository.transaction(async (tx) => {
      const row = await this.repository.findCard(userId, id, tx);
      if (!row || row.archivedAt)
        throw new NotFoundException('Cartão não encontrado.');
      await this.repository.claimCard(tx, userId, id, row.revision ?? 0);
      const card = this.mapper.card(row);
      const contents = await this.repository.commitments(tx, userId, id);
      const schedule = cardRule(() =>
        planPurchase(
          card,
          input,
          contents.installments.map((entry) => this.mapper.installment(entry)),
          contents.payments.map((entry) => this.mapper.payment(entry)),
        ),
      );
      const purchase = await this.repository.createPurchase(
        tx,
        userId,
        id,
        input.date,
        this.mapper.encryptPurchase(input),
      );
      await this.repository.createInstallments(
        tx,
        schedule.map((entry, index) => ({
          userId,
          cardId: id,
          purchaseId: purchase.id,
          number: index + 1,
          cycle: entry.cycle,
          dueDate: entry.dueDate,
          encryptedAmount: this.mapper.encryptAmount(entry.amount),
        })),
      );
      return { id: purchase.id, date: input.date, ...input };
    }, client);
  }

  /** Devolve valores já realizados e remove apenas parcelas pendentes; repetir é inofensivo. */
  async refundPurchase(userId: string, id: string, purchaseId: string) {
    checkCardId(id);
    checkCardId(purchaseId);
    return this.repository.transaction(async (tx) => {
      const card = await this.repository.findCard(userId, id, tx);
      if (!card) throw new NotFoundException('Cartão não encontrado.');
      const row = await this.repository.findPurchase(
        tx,
        userId,
        id,
        purchaseId,
      );
      if (!row) throw new NotFoundException('Compra não encontrada.');
      if (row.refundedAt) return { id: purchaseId, refunded: true };
      await this.repository.claimCard(tx, userId, id, card.revision ?? 0);
      const [installments, payments] = await Promise.all([
        this.repository.findPurchaseInstallments(tx, userId, id, purchaseId),
        this.repository.listPayments(tx, userId, id),
      ]);
      const purchase = this.mapper.purchase(row);
      const returnedCents = paidRefundCents(
        installments.map((entry) => this.mapper.installment(entry)),
        payments.map((entry) => this.mapper.payment(entry)),
      );
      let refundTransactionId: string | null = null;
      if (returnedCents) {
        const transaction = await this.repository.createTransaction(
          tx,
          this.mapper.transaction(userId, 'INCOME', todayKey(), {
            amountCents: returnedCents,
            category: 'OTHER',
            description: `Estorno: ${purchase.description}`,
          }),
        );
        refundTransactionId = transaction.id;
      }
      // Somente a contratação vinculada à compra pode ser reaberta. O repository
      // compara também competência e recibo, protegendo renovações posteriores.
      if (purchase.fixedExpenseId)
        await this.repository.reopenLinkedFixedExpense(
          tx,
          userId,
          purchase.fixedExpenseId,
          purchase.id,
          purchase.fixedExpenseDueDate,
        );
      await this.repository.deletePendingInstallments(
        tx,
        userId,
        id,
        purchaseId,
        payments.map((payment) => payment.cycle),
      );
      await this.repository.markRefunded(
        tx,
        userId,
        purchaseId,
        new Date(),
        refundTransactionId,
      );
      return {
        id: purchaseId,
        refunded: true,
        returnedAmount: fromCents(returnedCents),
      };
    });
  }
}
