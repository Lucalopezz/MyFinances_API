import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import { buildEncryptedTransactionData } from '../transactions/transaction-encryption.mapper';
import { todayKey } from '../calendar/calendar-calculation';
import {
  annualFeeForCycle,
  closingDateForCycle,
  dueDateForCycle,
  invoiceForPurchase,
  splitInstallments,
} from './card-calculation';
import { CardInput, PurchaseInput } from './cards.dto';

type CardSecret = {
  name: string;
  limitCents: number;
  annualFeeCents: number;
  feeFirstCycle: string;
};
type PurchaseSecret = {
  description: string;
  amountCents: number;
  category: string;
  installments: number;
};
type PaymentSecret = { date: string; amountCents: number };
const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => value / 100;
const objectId = (id: string) => /^[a-f\d]{24}$/i.test(id);

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly categories: CategoriesService,
  ) {}

  private checkId(id: string) {
    if (!objectId(id)) throw new BadRequestException('Cartão inválido.');
  }

  async createCard(userId: string, input: CardInput) {
    const firstCycle = invoiceForPurchase(
      todayKey(),
      input.closingDay,
      input.dueDay,
      0,
    ).cycle;
    const card = await this.prisma.creditCard.create({
      data: {
        userId,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        encryptedData: this.encryption.encrypt({
          name: input.name,
          limitCents: cents(input.limit),
          annualFeeCents: cents(input.annualFee),
          feeFirstCycle: firstCycle,
        } satisfies CardSecret),
      },
    });
    return { id: card.id, ...input };
  }

  async listCards(userId: string) {
    const cards = await this.prisma.creditCard.findMany({
      where: {
        userId,
        OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(cards.map((card) => this.detail(userId, card.id)));
  }

  async detail(userId: string, id: string) {
    this.checkId(id);
    const card = await this.prisma.creditCard.findFirst({
      where: { id, userId },
    });
    if (!card || card.archivedAt)
      throw new NotFoundException('Cartão não encontrado.');
    const secret = this.encryption.decrypt<CardSecret>(card.encryptedData);
    const [purchases, installments, payments] = await Promise.all([
      this.prisma.cardPurchase.findMany({
        where: { userId, cardId: id },
        orderBy: { purchaseDate: 'desc' },
      }),
      this.prisma.cardInstallment.findMany({
        where: { userId, cardId: id },
        orderBy: [{ cycle: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.cardPayment.findMany({ where: { userId, cardId: id } }),
    ]);
    const purchaseMap = new Map(
      purchases.map((row) => [
        row.id,
        this.encryption.decrypt<PurchaseSecret>(row.encryptedData),
      ]),
    );
    const paymentMap = new Map(payments.map((row) => [row.cycle, row]));
    const cycles = new Set(installments.map((row) => row.cycle));
    const currentYear = Number(todayKey().slice(0, 4));
    const firstYear = Number(secret.feeFirstCycle.slice(0, 4));
    if (secret.annualFeeCents) {
      for (let year = firstYear; year <= currentYear + 1; year++)
        cycles.add(`${year}-${secret.feeFirstCycle.slice(5)}`);
    }
    const invoices = [...cycles]
      .sort()
      .map((cycle) => {
        const lines = installments
          .filter((row) => row.cycle === cycle)
          .map((row) => {
            const purchase = purchaseMap.get(row.purchaseId)!;
            return {
              id: row.id,
              purchaseId: row.purchaseId,
              description: purchase.description,
              category: purchase.category,
              number: row.number,
              installments: purchase.installments,
              amount: money(
                this.encryption.decrypt<number>(row.encryptedAmount),
              ),
            };
          });
        const annualFee = money(
          annualFeeForCycle(cycle, secret.feeFirstCycle, secret.annualFeeCents),
        );
        const totalCents =
          lines.reduce((sum, line) => sum + cents(line.amount), 0) +
          cents(annualFee);
        const payment = paymentMap.get(cycle);
        return {
          cycle,
          dueDate: dueDateForCycle(cycle, card.dueDay),
          closingDate: closingDateForCycle(cycle, card.closingDay, card.dueDay),
          lines,
          annualFee,
          total: money(totalCents),
          paid: !!payment,
          paymentDate: payment
            ? this.encryption.decrypt<PaymentSecret>(payment.encryptedData).date
            : null,
          status: payment
            ? 'PAID'
            : dueDateForCycle(cycle, card.dueDay) < todayKey()
              ? 'OVERDUE'
              : 'PENDING',
        };
      })
      .filter((invoice) => invoice.total > 0);
    const currentCycle = invoiceForPurchase(
      todayKey(),
      card.closingDay,
      card.dueDay,
      0,
    ).cycle;
    const usedCents = invoices
      .filter((invoice) => !invoice.paid)
      .reduce(
        (sum, invoice) =>
          sum +
          cents(
            invoice.total -
              (invoice.cycle > currentCycle ? invoice.annualFee : 0),
          ),
        0,
      );
    return {
      id: card.id,
      name: secret.name,
      limit: money(secret.limitCents),
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      annualFee: money(secret.annualFeeCents),
      used: money(usedCents),
      available: money(secret.limitCents - usedCents),
      purchases: purchases.map((row) => ({
        id: row.id,
        date: row.purchaseDate,
        ...this.publicPurchase(purchaseMap.get(row.id)!),
      })),
      invoices,
    };
  }

  private publicPurchase(purchase: PurchaseSecret) {
    return {
      description: purchase.description,
      amount: money(purchase.amountCents),
      category: purchase.category,
      installments: purchase.installments,
    };
  }

  async removeCard(userId: string, id: string) {
    this.checkId(id);
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({ where: { id, userId } });
      if (!card || card.archivedAt)
        throw new NotFoundException('Cartão não encontrado.');
      const claim = await tx.creditCard.updateMany({
        where: { id, userId, revision: card.revision },
        data: { revision: { increment: 1 } },
      });
      if (!claim.count)
        throw new ConflictException('O cartão mudou. Atualize a página.');
      const [installments, payments] = await Promise.all([
        tx.cardInstallment.findMany({ where: { userId, cardId: id } }),
        tx.cardPayment.findMany({ where: { userId, cardId: id } }),
      ]);
      const paidCycles = new Set(payments.map((payment) => payment.cycle));
      if (installments.some((entry) => !paidCycles.has(entry.cycle))) {
        throw new BadRequestException(
          'Quite todas as compras parceladas antes de remover o cartão.',
        );
      }
      const secret = this.encryption.decrypt<CardSecret>(card.encryptedData);
      const today = todayKey();
      for (
        let year = Number(secret.feeFirstCycle.slice(0, 4));
        year <= Number(today.slice(0, 4));
        year++
      ) {
        const cycle = `${year}-${secret.feeFirstCycle.slice(5)}`;
        if (
          annualFeeForCycle(
            cycle,
            secret.feeFirstCycle,
            secret.annualFeeCents,
          ) > 0 &&
          closingDateForCycle(cycle, card.closingDay, card.dueDay) <= today &&
          !paidCycles.has(cycle)
        ) {
          throw new BadRequestException(
            'Quite as faturas de anuidade fechadas antes de remover o cartão.',
          );
        }
      }
      // Archive under the same revision lock as purchases and payments.
      // Keep receipts and ledger entries intact, including their protections.
      await tx.creditCard.update({
        where: { id, userId },
        data: { archivedAt: new Date() },
      });
      return { message: 'Cartão removido com sucesso.' };
    });
  }

  async createPurchase(userId: string, id: string, input: PurchaseInput) {
    this.checkId(id);
    if (input.date > todayKey())
      throw new BadRequestException('A compra não pode estar no futuro.');
    if (cents(input.amount) < input.installments)
      throw new BadRequestException(
        'O valor deve permitir parcelas de pelo menos um centavo.',
      );
    await this.categories.resolveReference(input.category, userId, 'EXPENSE');
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({ where: { id, userId } });
      if (!card || card.archivedAt)
        throw new NotFoundException('Cartão não encontrado.');
      // The card revision serializes concurrent purchases and payments.
      const claim = await tx.creditCard.updateMany({
        where: { id, userId, revision: card.revision },
        data: { revision: { increment: 1 } },
      });
      if (!claim.count)
        throw new ConflictException('O cartão mudou. Atualize a página.');
      const secret = this.encryption.decrypt<CardSecret>(card.encryptedData);
      const [existing, payments] = await Promise.all([
        tx.cardInstallment.findMany({ where: { userId, cardId: id } }),
        tx.cardPayment.findMany({ where: { userId, cardId: id } }),
      ]);
      const paidCycles = new Set(payments.map((p) => p.cycle));
      const amounts = splitInstallments(
        cents(input.amount),
        input.installments,
      );
      const schedule = amounts.map((amount, index) => ({
        amount,
        ...invoiceForPurchase(input.date, card.closingDay, card.dueDay, index),
      }));
      if (schedule.some((entry) => paidCycles.has(entry.cycle)))
        throw new BadRequestException(
          'A compra pertence a uma fatura já paga. Escolha uma data válida.',
        );
      const used = existing
        .filter((row) => !paidCycles.has(row.cycle))
        .reduce(
          (sum, row) =>
            sum + this.encryption.decrypt<number>(row.encryptedAmount),
          0,
        );
      const currentCycle = invoiceForPurchase(
        todayKey(),
        card.closingDay,
        card.dueDay,
        0,
      ).cycle;
      let feeUsed = 0;
      for (
        let year = Number(secret.feeFirstCycle.slice(0, 4));
        year <= Number(currentCycle.slice(0, 4));
        year++
      ) {
        const feeCycle = `${year}-${secret.feeFirstCycle.slice(5)}`;
        if (feeCycle <= currentCycle && !paidCycles.has(feeCycle))
          feeUsed += annualFeeForCycle(
            feeCycle,
            secret.feeFirstCycle,
            secret.annualFeeCents,
          );
      }
      if (used + feeUsed + cents(input.amount) > secret.limitCents)
        throw new BadRequestException('Limite disponível insuficiente.');
      const purchase = await tx.cardPurchase.create({
        data: {
          userId,
          cardId: id,
          purchaseDate: input.date,
          encryptedData: this.encryption.encrypt({
            description: input.description,
            amountCents: cents(input.amount),
            category: input.category,
            installments: input.installments,
          } satisfies PurchaseSecret),
        },
      });
      await tx.cardInstallment.createMany({
        data: schedule.map((entry, index) => ({
          userId,
          cardId: id,
          purchaseId: purchase.id,
          number: index + 1,
          cycle: entry.cycle,
          dueDate: entry.dueDate,
          encryptedAmount: this.encryption.encrypt(entry.amount),
        })),
      });
      return { id: purchase.id, date: input.date, ...input };
    });
  }

  async payInvoice(userId: string, id: string, cycle: string, date: string) {
    this.checkId(id);
    if (date > todayKey())
      throw new BadRequestException('Pagamento futuro não é permitido.');
    const card = await this.prisma.creditCard.findFirst({
      where: { id, userId },
    });
    if (!card || card.archivedAt)
      throw new NotFoundException('Cartão não encontrado.');
    const invoice = (await this.detail(userId, id)).invoices.find(
      (item) => item.cycle === cycle,
    );
    if (!invoice || !invoice.total)
      throw new NotFoundException('Fatura não encontrada.');
    if (invoice.paid) return invoice;
    const closingDate = closingDateForCycle(
      cycle,
      card.closingDay,
      card.dueDay,
    );
    if (closingDate > todayKey())
      throw new BadRequestException('A fatura ainda está aberta.');
    if (date < closingDate)
      throw new BadRequestException(
        'O pagamento não pode ser anterior ao fechamento.',
      );
    try {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.creditCard.updateMany({
          where: { id, userId, revision: card.revision },
          data: { revision: { increment: 1 } },
        });
        if (!claim.count)
          throw new ConflictException('O cartão mudou. Atualize a página.');
        const alreadyPaid = await tx.cardPayment.findUnique({
          where: { userId_cardId_cycle: { userId, cardId: id, cycle } },
        });
        if (alreadyPaid) return;
        const rows = await tx.cardInstallment.findMany({
          where: { userId, cardId: id, cycle },
        });
        const purchaseIds = [...new Set(rows.map((row) => row.purchaseId))];
        const purchases = await tx.cardPurchase.findMany({
          where: { userId, cardId: id, id: { in: purchaseIds } },
        });
        const byId = new Map(
          purchases.map((p) => [
            p.id,
            this.encryption.decrypt<PurchaseSecret>(p.encryptedData),
          ]),
        );
        const items = rows.map((row) => ({
          amountCents: this.encryption.decrypt<number>(row.encryptedAmount),
          category: byId.get(row.purchaseId)!.category,
          description: `${byId.get(row.purchaseId)!.description} (${row.number}/${byId.get(row.purchaseId)!.installments})`,
        }));
        if (invoice.annualFee)
          items.push({
            amountCents: cents(invoice.annualFee),
            category: 'OTHER',
            description: 'Anuidade do cartão',
          });
        const transactionIds: string[] = [];
        for (const item of items) {
          const data = buildEncryptedTransactionData(
            {
              value: money(item.amountCents),
              date: new Date(`${date}T12:00:00Z`),
              category: item.category,
              description: item.description,
              type: TransactionType.EXPENSE,
              userId,
            },
            this.encryption,
          );
          const transaction = await tx.transaction.create({
            data: data as Prisma.TransactionUncheckedCreateInput,
          });
          transactionIds.push(transaction.id);
        }
        await tx.cardPayment.create({
          data: {
            userId,
            cardId: id,
            cycle,
            transactionIds,
            encryptedData: this.encryption.encrypt({
              date,
              amountCents: items.reduce(
                (sum, item) => sum + item.amountCents,
                0,
              ),
            } satisfies PaymentSecret),
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // A unique index also prevents duplicate settlement across concurrent requests.
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Fatura já paga. Atualize a página.');
      throw error;
    }
    return (await this.detail(userId, id)).invoices.find(
      (item) => item.cycle === cycle,
    );
  }
}
