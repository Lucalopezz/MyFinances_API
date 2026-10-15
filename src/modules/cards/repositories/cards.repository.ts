import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

/** Persistência de cartões; o callback preserva um único contexto transacional entre módulos. */
@Injectable()
export class CardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    client?: Prisma.TransactionClient,
  ) {
    return client ? callback(client) : this.prisma.$transaction(callback);
  }

  findCard(userId: string, id: string, client?: Prisma.TransactionClient) {
    return (client ?? this.prisma).creditCard.findFirst({
      where: { id, userId },
    });
  }

  listCards(userId: string) {
    return this.prisma.creditCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createCard(
    userId: string,
    closingDay: number,
    dueDay: number,
    encryptedData: string,
  ) {
    return this.prisma.creditCard.create({
      data: { userId, closingDay, dueDay, encryptedData },
    });
  }

  async cardContents(
    userId: string,
    cardId: string,
    client?: Prisma.TransactionClient,
  ) {
    const db = client ?? this.prisma;
    const [purchases, installments, payments] = await Promise.all([
      db.cardPurchase.findMany({
        where: { userId, cardId },
        orderBy: { purchaseDate: 'desc' },
      }),
      db.cardInstallment.findMany({
        where: { userId, cardId },
        orderBy: [{ cycle: 'asc' }, { number: 'asc' }],
      }),
      db.cardPayment.findMany({ where: { userId, cardId } }),
    ]);
    return { purchases, installments, payments };
  }

  /** A validação de limite não precisa carregar os dados de cada compra histórica. */
  async commitments(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
  ) {
    const [installments, payments] = await Promise.all([
      tx.cardInstallment.findMany({ where: { userId, cardId } }),
      tx.cardPayment.findMany({ where: { userId, cardId } }),
    ]);
    return { installments, payments };
  }

  /** A revisão serializa compras, pagamento, estorno e arquivamento, inclusive registros legados. */
  async claimCard(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    revision: number,
  ) {
    const claim = await tx.creditCard.updateMany({
      where: { id, userId, OR: [{ revision }, { revision: { isSet: false } }] },
      data: { revision: revision + 1 },
    });
    if (!claim.count)
      throw new ConflictException('O cartão mudou. Atualize a página.');
  }

  archiveCard(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    archivedAt: Date,
  ) {
    return tx.creditCard.update({
      where: { id, userId },
      data: { archivedAt },
    });
  }

  createPurchase(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    purchaseDate: string,
    encryptedData: string,
  ) {
    return tx.cardPurchase.create({
      data: { userId, cardId, purchaseDate, encryptedData },
    });
  }

  createInstallments(
    tx: Prisma.TransactionClient,
    data: Prisma.CardInstallmentCreateManyInput[],
  ) {
    return tx.cardInstallment.createMany({ data });
  }

  findPurchase(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    id: string,
  ) {
    return tx.cardPurchase.findFirst({ where: { id, cardId, userId } });
  }

  findPurchaseInstallments(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    purchaseId: string,
  ) {
    return tx.cardInstallment.findMany({
      where: { userId, cardId, purchaseId },
    });
  }

  listPayments(tx: Prisma.TransactionClient, userId: string, cardId: string) {
    return tx.cardPayment.findMany({ where: { userId, cardId } });
  }

  createTransaction(
    tx: Prisma.TransactionClient,
    data: Prisma.TransactionUncheckedCreateInput,
  ) {
    return tx.transaction.create({ data });
  }

  /** A associação identifica uma competência exata; um estorno antigo não reabre uma renovação. */
  reopenLinkedFixedExpense(
    tx: Prisma.TransactionClient,
    userId: string,
    expenseId: string,
    purchaseId: string,
    dueDate: Date | null,
  ) {
    return tx.fixedExpense.updateMany({
      where: {
        id: expenseId,
        userId,
        paidCardPurchaseId: purchaseId,
        dueDate: dueDate ?? undefined,
      },
      data: { isPaid: false, paidAt: null, paidCardPurchaseId: null },
    });
  }

  deletePendingInstallments(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    purchaseId: string,
    paidCycles: string[],
  ) {
    return tx.cardInstallment.deleteMany({
      where: { userId, cardId, purchaseId, cycle: { notIn: paidCycles } },
    });
  }

  markRefunded(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    refundedAt: Date,
    refundTransactionId: string | null,
  ) {
    return tx.cardPurchase.update({
      where: { id, userId },
      data: { refundedAt, refundTransactionId },
    });
  }

  findPayment(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    cycle: string,
  ) {
    return tx.cardPayment.findUnique({
      where: { userId_cardId_cycle: { userId, cardId, cycle } },
    });
  }

  async invoiceContents(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    cycle: string,
  ) {
    const installments = await tx.cardInstallment.findMany({
      where: { userId, cardId, cycle },
    });
    const purchaseIds = [...new Set(installments.map((row) => row.purchaseId))];
    const purchases = await tx.cardPurchase.findMany({
      where: { userId, cardId, id: { in: purchaseIds } },
    });
    return { installments, purchases };
  }

  createPayment(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    cycle: string,
    transactionIds: string[],
    encryptedData: string,
  ) {
    // O índice único por usuário/cartão/ciclo é uma segunda defesa contra duplicidade.
    return tx.cardPayment.create({
      data: { userId, cardId, cycle, transactionIds, encryptedData },
    });
  }
}
