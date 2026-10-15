import { Injectable } from '@nestjs/common';
import {
  CardInstallment,
  CardPayment,
  CardPurchase,
  CreditCard,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { fromCents, toCents } from 'src/common/money/money';
import { buildEncryptedTransactionData } from '../../transactions/mappers/transaction-encryption.mapper';
import {
  Card,
  CardTerms,
  Installment,
  NewCard,
  NewPurchase,
  Payment,
  Purchase,
  PurchaseTerms,
  SettlementItem,
} from '../types/cards.types';

/** Único adaptador entre campos cifrados do cartão e dados financeiros em centavos. */
@Injectable()
export class CardEncryptionMapper {
  constructor(private readonly encryption: FinancialDataEncryptionService) {}

  card(row: CreditCard): Card {
    return {
      id: row.id,
      closingDay: row.closingDay,
      dueDay: row.dueDay,
      archivedAt: row.archivedAt,
      revision: row.revision ?? 0,
      ...this.encryption.decrypt<CardTerms>(row.encryptedData),
    };
  }

  purchase(row: CardPurchase): Purchase {
    return {
      id: row.id,
      purchaseDate: row.purchaseDate,
      refundedAt: row.refundedAt,
      fixedExpenseId: row.fixedExpenseId,
      fixedExpenseDueDate: row.fixedExpenseDueDate,
      ...this.encryption.decrypt<PurchaseTerms>(row.encryptedData),
    };
  }

  installment(row: CardInstallment): Installment {
    return {
      id: row.id,
      purchaseId: row.purchaseId,
      cycle: row.cycle,
      number: row.number,
      amountCents: this.encryption.decrypt<number>(row.encryptedAmount),
    };
  }

  payment(row: CardPayment): Payment {
    return {
      cycle: row.cycle,
      transactionIds: row.transactionIds,
      ...this.encryption.decrypt<{ date: string; amountCents: number }>(
        row.encryptedData,
      ),
    };
  }

  encryptCard(input: NewCard, feeFirstCycle: string) {
    return this.encryption.encrypt({
      name: input.name,
      limitCents: toCents(input.limit),
      annualFeeCents: toCents(input.annualFee),
      feeFirstCycle,
    } satisfies CardTerms);
  }

  encryptPurchase(input: NewPurchase) {
    return this.encryption.encrypt({
      description: input.description,
      amountCents: toCents(input.amount),
      category: input.category,
      installments: input.installments,
    } satisfies PurchaseTerms);
  }

  encryptAmount(amountCents: number) {
    return this.encryption.encrypt(amountCents);
  }

  encryptPayment(date: string, amountCents: number) {
    return this.encryption.encrypt({ date, amountCents });
  }

  /** Lançamentos usam o mapper público de transações e a mesma chave financeira. */
  transaction(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    date: string,
    item: SettlementItem,
  ) {
    return buildEncryptedTransactionData(
      {
        userId,
        type: TransactionType[type],
        value: fromCents(item.amountCents),
        date: new Date(`${date}T12:00:00Z`),
        category: item.category,
        description: item.description,
      },
      this.encryption,
    ) as Prisma.TransactionUncheckedCreateInput;
  }
}
