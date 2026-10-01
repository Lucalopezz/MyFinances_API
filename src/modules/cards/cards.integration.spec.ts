import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import { todayKey } from '../calendar/calendar-calculation';
import { CardsService } from './cards.service';
import { CalendarService } from '../calendar/calendar.service';

(process.env.CARDS_TEST_DATABASE_URL ? describe : describe.skip)(
  'credit cards with real MongoDB',
  () => {
    let db: PrismaClient;
    let service: CardsService;
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
      execFileSync(
        process.execPath,
        [
          resolve('node_modules/prisma/build/index.js'),
          'db',
          'push',
          '--skip-generate',
        ],
        {
          env: { ...process.env, DATABASE_URL: url.toString() },
          stdio: 'pipe',
        },
      );
      db = new PrismaClient({ datasourceUrl: url.toString() });
      await db.$connect();
      service = new CardsService(
        db as unknown as PrismaService,
        encryption as FinancialDataEncryptionService,
        {
          resolveReference: async () => undefined,
        } as unknown as CategoriesService,
      );
    }, 60000);
    afterAll(async () => {
      if (db) {
        await db.$runCommandRaw({ dropDatabase: 1 });
        await db.$disconnect();
      }
    });
    beforeEach(async () => {
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
      expect((await service.detail(owner, card.id)).used).toBe(300);
      expect(
        await db.cardInstallment.count({ where: { purchaseId: purchase.id } }),
      ).toBe(3);
      const cardDetail = await service.detail(owner, card.id);
      const invoice = cardDetail.invoices[0];
      // An open statement cannot be paid before its closing date.
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
          amount: 201,
          date,
          category: 'SHOPPING',
          installments: 1,
        }),
      ).rejects.toThrow('Limite');
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
      expect((await service.detail(owner, card.id)).used).toBe(66.67);
      const payment = await db.cardPayment.findFirstOrThrow({
        where: { cardId: card.id },
      });
      const repo = new TransactionsRepository(db as unknown as PrismaService);
      await expect(
        repo.deleteOwned(payment.transactionIds[0], owner),
      ).rejects.toThrow('vinculada');
      const calendar = new CalendarService(
        db as unknown as PrismaService,
        encryption as FinancialDataEncryptionService,
        {} as CategoriesService,
        service,
      );
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
  },
);
