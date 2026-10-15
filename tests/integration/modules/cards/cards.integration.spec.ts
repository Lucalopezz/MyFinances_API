import { FixedExpensesRepository } from 'src/modules/fixed-expenses/repositories/fixed-expenses.repository';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { CategoriesService } from 'src/modules/categories/categories.service';
import { TransactionsRepository } from 'src/modules/transactions/repositories/transactions.repository';
import { todayKey } from 'src/common/date/civil-date';
import { CardsService } from 'src/modules/cards/cards.service';
import { CalendarService } from 'src/modules/calendar/services/calendar.service';
import { CalendarRepository } from 'src/modules/calendar/repositories/calendar.repository';
import { CalendarReceiptMapper } from 'src/modules/calendar/mappers/calendar-receipt.mapper';
import { RecurringIncomesService } from 'src/modules/recurring-incomes/services/recurring-incomes.service';
import { RecurringIncomesRepository } from 'src/modules/recurring-incomes/repositories/recurring-incomes.repository';
import { RecurringIncomeEncryptionMapper } from 'src/modules/recurring-incomes/mappers/recurring-income-encryption.mapper';
import { TransactionQueriesService } from 'src/modules/transactions/services/transaction-queries.service';
import { CardsRepository } from 'src/modules/cards/repositories/cards.repository';
import { CardEncryptionMapper } from 'src/modules/cards/mappers/card-encryption.mapper';
import { CardsCatalogService } from 'src/modules/cards/services/cards-catalog.service';
import { CardPurchasesService } from 'src/modules/cards/services/card-purchases.service';
import { CardInvoicesService } from 'src/modules/cards/services/card-invoices.service';
import { FixedExpensePaymentService } from 'src/modules/fixed-expenses/services/fixed-expense-payment.service';
import { FixedExpensePaymentsRepository } from 'src/modules/fixed-expenses/repositories/fixed-expense-payments.repository';
import { FixedExpenseRawFieldsService } from 'src/modules/fixed-expenses/services/fixed-expense-raw-fields.service';

const execFileAsync = promisify(execFile);

(process.env.CARDS_TEST_DATABASE_URL ? describe : describe.skip)(
  'credit cards with real MongoDB',
  () => {
    let db: PrismaClient;
    let service: CardsService;
    let fixedExpensePayments: FixedExpensePaymentService;
    let calendar: CalendarService;
    const owner = '64f000000000000000000001';
    const other = '64f000000000000000000002';
    const encryption = {
      encrypt: (value: unknown) => JSON.stringify(value),
      decrypt: <T>(value: string): T => JSON.parse(value) as T,
    };
    beforeAll(async () => {
      const url = new URL(process.env.CARDS_TEST_DATABASE_URL!);
      if (
        url.protocol !== 'mongodb:' ||
        !['localhost', '127.0.0.1'].includes(url.hostname)
      )
        throw new Error('Use somente MongoDB local.');
      url.pathname = `/myfinances_cards_test_${randomBytes(8).toString('hex')}`;
      // Aguarda o Prisma terminar sem bloquear o processo de testes. A chamada
      // síncrona falha em ambientes restritos; a configuração real do banco e
      // os guardas que limitam o destino a localhost continuam obrigatórios.
      await execFileAsync(
        process.execPath,
        [
          resolve('node_modules/prisma/build/index.js'),
          'db',
          'push',
          '--skip-generate',
        ],
        {
          env: { ...process.env, DATABASE_URL: url.toString() },
        },
      );
      db = new PrismaClient({ datasourceUrl: url.toString() });
      await db.$connect();
      const prisma = db as unknown as PrismaService;
      const categories = {
        resolveReference: async () => undefined,
      } as unknown as CategoriesService;
      const repository = new CardsRepository(prisma);
      const mapper = new CardEncryptionMapper(
        encryption as FinancialDataEncryptionService,
      );
      const catalog = new CardsCatalogService(repository, mapper);
      service = new CardsService(
        catalog,
        new CardPurchasesService(repository, mapper, categories),
        new CardInvoicesService(repository, mapper, catalog),
      );
      fixedExpensePayments = new FixedExpensePaymentService(
        categories,
        new FixedExpensePaymentsRepository(
          prisma,
          new FixedExpenseRawFieldsService(prisma),
        ),
        encryption as FinancialDataEncryptionService,
        service,
      );
      calendar = new CalendarService(
        new CalendarRepository(prisma),
        new CalendarReceiptMapper(encryption as FinancialDataEncryptionService),
        new RecurringIncomesService(
          new RecurringIncomesRepository(prisma),
          new RecurringIncomeEncryptionMapper(
            encryption as FinancialDataEncryptionService,
          ),
          categories,
        ),
        service,
        new TransactionQueriesService(
          categories,
          new TransactionsRepository(prisma),
          encryption as FinancialDataEncryptionService,
        ),
      );
    }, 60000);
    afterAll(async () => {
      if (db) {
        await db.$runCommandRaw({ dropDatabase: 1 });
        await db.$disconnect();
      }
    });
    beforeEach(async () => {
      await db.fixedExpense.deleteMany();
      await db.cardPayment.deleteMany();
      await db.cardInstallment.deleteMany();
      await db.cardPurchase.deleteMany();
      await db.creditCard.deleteMany();
      await db.transaction.deleteMany();
    });
    it('creates installments without ledger entries, settles a statement once, and releases limit', async () => {
      const card = await service.createCard(owner, {
        name: 'Principal',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const date = todayKey();
      const purchase = await service.createPurchase(owner, card.id, {
        description: 'Compra',
        amount: 300,
        date,
        category: 'SHOPPING',
        installments: 3,
      });
      expect(await db.transaction.count()).toBe(0);
      expect((await service.detail(owner, card.id)).used).toBe(100);
      expect(
        await db.cardInstallment.count({ where: { purchaseId: purchase.id } }),
      ).toBe(3);
      const cardDetail = await service.detail(owner, card.id);
      const invoice = cardDetail.invoices[0];
      // Uma fatura aberta não pode ser paga antes da data de fechamento.
      if (invoice.closingDate > date)
        await expect(
          service.payInvoice(owner, card.id, invoice.cycle, date),
        ).rejects.toThrow('aberta');
      await expect(service.detail(other, card.id)).rejects.toThrow(
        'não encontrado',
      );
      await expect(
        service.createPurchase(owner, card.id, {
          description: 'Excede',
          amount: 401,
          date,
          category: 'SHOPPING',
          installments: 1,
        }),
      ).rejects.toThrow('Limite');
    });
    it('validates the installment in every cycle rather than the purchase total', async () => {
      const card = await service.createCard(owner, {
        name: 'Parcelado',
        limit: 100,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      await service.createPurchase(owner, card.id, {
        description: 'Plano anual',
        amount: 1200,
        date: todayKey(),
        category: 'OTHER',
        installments: 12,
      });
      expect((await service.detail(owner, card.id)).used).toBe(100);
      await expect(
        service.createPurchase(owner, card.id, {
          description: 'Excede parcela',
          amount: 0.01,
          date: todayKey(),
          category: 'OTHER',
          installments: 1,
        }),
      ).rejects.toThrow('Limite insuficiente');
    });
    it('settles a closed historical statement atomically and protects linked transactions', async () => {
      const card = await service.createCard(owner, {
        name: 'Histórico',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      await service.createPurchase(owner, card.id, {
        description: 'Livros',
        amount: 100.01,
        date: '2025-01-01',
        category: 'SHOPPING',
        installments: 3,
      });
      const invoice = (await service.detail(owner, card.id)).invoices[0];
      expect(invoice.total).toBe(33.34);
      const paid = await service.payInvoice(
        owner,
        card.id,
        invoice.cycle,
        todayKey(),
      );
      expect(paid?.paid).toBe(true);
      expect(await db.transaction.count()).toBe(1);
      await service.payInvoice(owner, card.id, invoice.cycle, todayKey());
      expect(await db.transaction.count()).toBe(1);
      expect((await service.detail(owner, card.id)).used).toBe(33.34);
      const payment = await db.cardPayment.findFirstOrThrow({
        where: { cardId: card.id },
      });
      const repo = new TransactionsRepository(db as unknown as PrismaService);
      await expect(
        repo.deleteOwned(payment.transactionIds[0], owner),
      ).rejects.toThrow('vinculada');
      const projection = await calendar.calendar(owner, todayKey().slice(0, 7));
      expect(
        projection.overdue.filter((event) => event.sourceId === card.id),
      ).toHaveLength(2);
      expect(projection.projection.overdueImpact).toBe(-66.67);
      expect(projection.projection.projectedBalance).toBe(-100.01);
      await expect(
        service.createPurchase(owner, card.id, {
          description: 'Retroativa',
          amount: 10,
          date: '2025-01-01',
          category: 'SHOPPING',
          installments: 1,
        }),
      ).rejects.toThrow('paga');
    });
    it('refunds paid installments once, cancels pending debt and isolates ownership', async () => {
      const card = await service.createCard(owner, {
        name: 'Estorno',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const purchase = await service.createPurchase(owner, card.id, {
        description: 'Curso',
        amount: 300,
        date: '2025-01-01',
        category: 'OTHER',
        installments: 3,
      });
      await service.payInvoice(owner, card.id, '2025-01', todayKey());
      await expect(
        service.refundPurchase(other, card.id, purchase.id),
      ).rejects.toThrow('não encontrado');
      await service.refundPurchase(owner, card.id, purchase.id);
      await service.refundPurchase(owner, card.id, purchase.id);
      expect((await service.detail(owner, card.id)).used).toBe(0);
      expect(
        await db.cardInstallment.count({ where: { purchaseId: purchase.id } }),
      ).toBe(1);
      expect(
        await db.transaction.count({
          where: { userId: owner, type: 'INCOME' },
        }),
      ).toBe(1);
      const row = await db.cardPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      const repo = new TransactionsRepository(db as unknown as PrismaService);
      await expect(
        repo.deleteOwned(row.refundTransactionId!, owner),
      ).rejects.toThrow('estorno');
    });
    it('links an annual fixed expense to twelve installments without duplicating cash or renewal', async () => {
      const card = await service.createCard(owner, {
        name: 'Academia',
        limit: 100,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const expense = await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Plano anual',
          amount: 1200,
          category: 'OTHER',
          dueDate: new Date(`${todayKey()}T12:00:00Z`),
          recurrence: 'YEARLY',
          cardId: card.id,
          cardInstallments: 12,
        },
      });
      await fixedExpensePayments.chargeCardExpense(owner, expense.id);
      await fixedExpensePayments.chargeCardExpense(owner, expense.id);
      expect(await db.cardPurchase.count()).toBe(1);
      expect(await db.cardInstallment.count()).toBe(12);
      expect(await db.transaction.count()).toBe(0);
      const upcomingMonth = (await service.detail(owner, card.id)).invoices[0]
        .cycle;
      const before = await calendar.calendar(owner, upcomingMonth);
      expect(
        before.events.filter((event) => event.type === 'EXPENSE'),
      ).toHaveLength(1);
      expect(before.events[0].amount).toBe(100);
      const paid = await db.fixedExpense.findUniqueOrThrow({
        where: { id: expense.id },
      });
      await service.refundPurchase(owner, card.id, paid.paidCardPurchaseId!);
      expect(
        (await db.fixedExpense.findUniqueOrThrow({ where: { id: expense.id } }))
          .isPaid,
      ).toBe(false);
      // Após estornar, a projeção volta às parcelas previstas, sem uma saída anual inteira.
      const planned = await calendar.calendar(owner, upcomingMonth);
      expect(planned.events[0].amount).toBe(100);
      await fixedExpensePayments.chargeCardExpense(owner, expense.id);
      const nextYear = new Date(expense.dueDate);
      nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
      await new FixedExpensesRepository(
        db as unknown as PrismaService,
        encryption as FinancialDataEncryptionService,
      ).refreshCycle(expense.id, nextYear, expense.dueDate);
      const renewal = await db.fixedExpense.findUniqueOrThrow({
        where: { id: expense.id },
      });
      expect(renewal.isPaid).toBe(false);
      expect(renewal.dueDate).toEqual(nextYear);
      expect(renewal.paidCardPurchaseId).toBeNull();
      expect(await db.cardInstallment.count()).toBe(12);
    });
    it('rolls back a fixed expense registration when its installment exceeds the limit', async () => {
      const card = await service.createCard(owner, {
        name: 'Sem limite',
        limit: 50,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const expense = await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Plano',
          amount: 1200,
          category: 'OTHER',
          dueDate: new Date(`${todayKey()}T12:00:00Z`),
          recurrence: 'YEARLY',
          cardId: card.id,
          cardInstallments: 12,
        },
      });
      await expect(
        fixedExpensePayments.chargeCardExpense(owner, expense.id),
      ).rejects.toThrow('Limite');
      expect(
        (await db.fixedExpense.findUniqueOrThrow({ where: { id: expense.id } }))
          .isPaid,
      ).toBe(false);
      expect(await db.cardPurchase.count()).toBe(0);
    });
    it('does not reopen a renewed expense when an older purchase is refunded', async () => {
      const card = await service.createCard(owner, {
        name: 'Renovações',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const expense = await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Plano anual',
          amount: 1200,
          category: 'OTHER',
          dueDate: new Date(`${todayKey()}T12:00:00Z`),
          recurrence: 'YEARLY',
          cardId: card.id,
          cardInstallments: 12,
        },
      });
      const first = await fixedExpensePayments.chargeCardExpense(
        owner,
        expense.id,
      );
      const nextDueDate = new Date(expense.dueDate);
      nextDueDate.setUTCFullYear(nextDueDate.getUTCFullYear() + 1);
      await new FixedExpensesRepository(
        db as unknown as PrismaService,
        encryption as FinancialDataEncryptionService,
      ).refreshCycle(expense.id, nextDueDate, expense.dueDate);
      const renewal = await fixedExpensePayments.chargeCardExpense(
        owner,
        expense.id,
      );
      // A compra original conserva sua competência; a renovação tem outro recibo.
      await service.refundPurchase(owner, card.id, first.paidCardPurchaseId!);
      expect(
        await db.fixedExpense.findUniqueOrThrow({ where: { id: expense.id } }),
      ).toMatchObject({
        isPaid: true,
        dueDate: nextDueDate,
        paidCardPurchaseId: renewal.paidCardPurchaseId,
      });
      expect(
        await db.cardInstallment.count({
          where: { purchaseId: renewal.paidCardPurchaseId! },
        }),
      ).toBe(12);
    });
    it('contracts a fixed expense once when confirmations run concurrently', async () => {
      const card = await service.createCard(owner, {
        name: 'Concorrência da contratação',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const expense = await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Plano',
          amount: 1200,
          category: 'OTHER',
          dueDate: new Date(`${todayKey()}T12:00:00Z`),
          recurrence: 'YEARLY',
          cardId: card.id,
          cardInstallments: 12,
        },
      });
      const attempts = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          fixedExpensePayments.chargeCardExpense(owner, expense.id),
        ),
      );
      expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(
        true,
      );
      expect(
        await db.cardPurchase.count({ where: { fixedExpenseId: expense.id } }),
      ).toBe(1);
      expect(await db.cardInstallment.count()).toBe(12);
      expect(await db.transaction.count()).toBe(0);
      expect(
        (await db.fixedExpense.findUniqueOrThrow({ where: { id: expense.id } }))
          .paidCardPurchaseId,
      ).toBeTruthy();
    });
    it('charges the annual fee once and never settles a statement twice under concurrent calls', async () => {
      const card = await service.createCard(owner, {
        name: 'Com anuidade',
        limit: 300,
        closingDay: 5,
        dueDay: 12,
        annualFee: 60,
      });
      const initial = await service.detail(owner, card.id);
      expect(
        initial.invoices.filter((invoice) => invoice.annualFee > 0),
      ).toHaveLength(2);
      expect(initial.used).toBe(60);
      const row = await db.creditCard.findUniqueOrThrow({
        where: { id: card.id },
      });
      const secret = encryption.decrypt<{
        name: string;
        limitCents: number;
        annualFeeCents: number;
        feeFirstCycle: string;
      }>(row.encryptedData);
      await db.creditCard.update({
        where: { id: card.id },
        data: {
          encryptedData: encryption.encrypt({
            ...secret,
            feeFirstCycle: '2025-01',
          }),
        },
      });
      const cycle = '2025-01';
      const attempts = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          service.payInvoice(owner, card.id, cycle, todayKey()),
        ),
      );
      expect(attempts.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      expect(
        await db.cardPayment.count({ where: { cardId: card.id, cycle } }),
      ).toBe(1);
      expect(await db.transaction.count({ where: { userId: owner } })).toBe(1);
      expect(
        (await service.detail(owner, card.id)).invoices.find(
          (invoice) => invoice.cycle === cycle,
        )?.paid,
      ).toBe(true);
    });
    it('removes an unused legacy card only for its owner and prevents later purchases', async () => {
      const card = await service.createCard(owner, {
        name: 'Sem compras',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      expect(
        (await service.listCards(owner)).map((entry) => entry.id),
      ).toContain(card.id);
      await expect(service.removeCard(other, card.id)).rejects.toThrow(
        'não encontrado',
      );
      await expect(service.removeCard(owner, 'invalid')).rejects.toThrow(
        'inválido',
      );
      await service.removeCard(owner, card.id);
      expect((await service.listCards(owner))[0].archived).toBe(true);
      expect(
        (await db.creditCard.findUniqueOrThrow({ where: { id: card.id } }))
          .archivedAt,
      ).toBeInstanceOf(Date);
      expect((await service.detail(owner, card.id)).archived).toBe(true);
      await expect(
        service.createPurchase(owner, card.id, {
          description: 'Bloqueada',
          amount: 10,
          date: todayKey(),
          category: 'SHOPPING',
          installments: 1,
        }),
      ).rejects.toThrow('não encontrado');
    });
    it('requires settled installments and preserves payments and protected ledger entries after removal', async () => {
      const card = await service.createCard(owner, {
        name: 'Histórico preservado',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      await service.createPurchase(owner, card.id, {
        description: 'Livros',
        amount: 100.01,
        date: '2025-01-01',
        category: 'SHOPPING',
        installments: 2,
      });
      await service.removeCard(owner, card.id);
      expect((await service.detail(owner, card.id)).invoices).toHaveLength(2);
      for (const invoice of (await service.detail(owner, card.id)).invoices) {
        await service.payInvoice(owner, card.id, invoice.cycle, todayKey());
      }
      await service.removeCard(owner, card.id);
      expect(await db.transaction.count({ where: { userId: owner } })).toBe(2);
      expect(await db.cardPayment.count({ where: { cardId: card.id } })).toBe(
        2,
      );
      const payment = await db.cardPayment.findFirstOrThrow({
        where: { cardId: card.id },
      });
      const repo = new TransactionsRepository(db as unknown as PrismaService);
      await expect(
        repo.deleteOwned(payment.transactionIds[0], owner),
      ).rejects.toThrow('vinculada');
    });
    it('blocks removal with a closed unpaid annual fee', async () => {
      const card = await service.createCard(owner, {
        name: 'Anuidade pendente',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 50,
      });
      const row = await db.creditCard.findUniqueOrThrow({
        where: { id: card.id },
      });
      await db.creditCard.update({
        where: { id: card.id },
        data: {
          encryptedData: encryption.encrypt({
            ...encryption.decrypt<object>(row.encryptedData),
            feeFirstCycle: '2025-01',
          }),
        },
      });
      await service.removeCard(owner, card.id);
      expect(
        (await service.detail(owner, card.id)).invoices.some(
          (invoice) => invoice.cycle === '2025-01',
        ),
      ).toBe(true);
    });
    it('serializes removal and a concurrent purchase without orphaning debt', async () => {
      const card = await service.createCard(owner, {
        name: 'Concorrência',
        limit: 500,
        closingDay: 5,
        dueDay: 12,
        annualFee: 0,
      });
      const [removal, purchase] = await Promise.allSettled([
        service.removeCard(owner, card.id),
        service.createPurchase(owner, card.id, {
          description: 'Concorrente',
          amount: 100,
          date: todayKey(),
          category: 'SHOPPING',
          installments: 1,
        }),
      ]);
      expect(
        [removal, purchase].some((result) => result.status === 'fulfilled'),
      ).toBe(true);
      expect(
        removal.status === 'fulfilled' && purchase.status === 'fulfilled',
      ).toBe(false);
      const row = await db.creditCard.findUniqueOrThrow({
        where: { id: card.id },
      });
      if (row.archivedAt)
        expect(
          await db.cardInstallment.count({ where: { cardId: card.id } }),
        ).toBe(0);
      else expect((await service.detail(owner, card.id)).used).toBe(100);
    });
  },
);
