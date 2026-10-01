import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import * as request from 'supertest';
import jwtConfig from 'src/common/config/jwt.config';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { CalendarService } from './calendar.service';
import { CardsService } from '../cards/cards.service';
import { CalendarController } from './calendar.controller';
import { todayKey } from './calendar-calculation';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import { buildEncryptedTransactionData } from '../transactions/transaction-encryption.mapper';
import { FixedExpensePaymentsRepository } from '../fixed-expenses/repositories/fixed-expense-payments.repository';
import { FixedExpensePaymentService } from '../fixed-expenses/services/fixed-expense-payment.service';
import { FixedExpenseRawFieldsService } from '../fixed-expenses/services/fixed-expense-raw-fields.service';
import { FixedExpensesRepository } from '../fixed-expenses/repositories/fixed-expenses.repository';

(process.env.CALENDAR_TEST_DATABASE_URL ? describe : describe.skip)(
  'calendar with real MongoDB',
  () => {
    let db: PrismaClient;
    let service: CalendarService;
    let app: INestApplication;
    let encryption: FinancialDataEncryptionService;
    let categories: CategoriesService;
    let token: string;
    const owner = '64f000000000000000000001';
    const other = '64f000000000000000000002';
    const today = todayKey();
    const month = today.slice(0, 7);
    const start = `${month}-01`;
    const income = {
      description: 'Salário privado',
      amount: 100,
      category: 'SALARY',
      startDate: start,
      recurrence: 'MONTHLY' as const,
      paused: false,
    };
    beforeAll(async () => {
      const url = new URL(process.env.CALENDAR_TEST_DATABASE_URL!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.protocol !== 'mongodb:'
      )
        throw new Error('Use apenas MongoDB local explícito.');
      url.pathname = `/myfinances_calendar_test_${randomBytes(8).toString('hex')}`;
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
      const jwt = new JwtService({ secret: 'calendar-test-only' });
      const module = await Test.createTestingModule({
        controllers: [CalendarController],
        providers: [
          CalendarService,
          { provide: CardsService, useValue: { listCards: async () => [] } },
          CategoriesService,
          CategoriesRepository,
          FinancialDataEncryptionService,
          { provide: PrismaService, useValue: db },
          { provide: JwtService, useValue: jwt },
          {
            provide: jwtConfig.KEY,
            useValue: { secret: 'calendar-test-only' },
          },
        ],
      }).compile();
      service = module.get(CalendarService);
      encryption = module.get(FinancialDataEncryptionService);
      categories = module.get(CategoriesService);
      token = jwt.sign({ sub: owner });
      app = module.createNestApplication();
      await app.init();
    }, 60000);
    afterAll(async () => {
      await app?.close();
      if (db) {
        await db.$runCommandRaw({ dropDatabase: 1 });
        await db.$disconnect();
      }
    });
    beforeEach(async () => {
      await db.calendarReceipt.deleteMany();
      await db.recurringIncome.deleteMany();
      await db.transaction.deleteMany();
      await db.fixedExpense.deleteMany();
      await db.category.deleteMany();
    });
    it('encrypts schedules and creates no actual income merely by listing', async () => {
      const row = await service.create(owner, income);
      expect(
        (await db.recurringIncome.findUnique({ where: { id: row.id } }))
          .encryptedData,
      ).not.toContain(income.description);
      expect((await service.calendar(owner, month)).events[0]).toMatchObject({
        amount: 100,
        dueDate: start,
        type: 'INCOME',
      });
      expect(await db.transaction.count()).toBe(0);
    });
    it('serializes concurrent confirmations and returns the same receipt on retry', async () => {
      const row = await service.create(owner, income);
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          service.confirm(owner, row.id, start, { amount: 90, date: today }),
        ),
      );
      expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
      expect(await db.transaction.count()).toBe(1);
      expect(await db.calendarReceipt.count()).toBe(1);
      const retry = await service.confirm(owner, row.id, start, {
        amount: 200,
        date: today,
      });
      expect(retry.actualAmount).toBe(90);
      const calendar = await service.calendar(owner, month);
      expect(calendar.events).toHaveLength(1);
      expect(calendar.events[0].status).toBe('SETTLED');
      expect(calendar.projection.projectedBalance).toBe(90);
      const repository = new TransactionsRepository(db as never);
      await expect(
        repository.deleteOwned(retry.transactionId, owner),
      ).rejects.toThrow('vinculada');
    });
    it('isolates users, rejects invalid periods and protects archived or foreign categories', async () => {
      const row = await service.create(owner, income);
      expect((await service.calendar(other, month)).events).toEqual([]);
      await expect(
        service.confirm(other, row.id, start, { amount: 90, date: today }),
      ).rejects.toThrow('não encontrada');
      await expect(
        service.update(other, row.id, { revision: 0, paused: true }),
      ).rejects.toThrow('não encontrada');
      await expect(service.calendar(owner, '2200-01')).rejects.toThrow(
        '12 meses',
      );
      await expect(
        service.confirm(owner, row.id, `${month}-02`, {
          amount: 90,
          date: today,
        }),
      ).rejects.toThrow('inválida');
      const category = await categories.create(
        { name: 'Privado', type: 'INCOME', color: '#112233', icon: 'Tag' },
        other,
      );
      await expect(
        service.create(owner, { ...income, category: category.id }),
      ).rejects.toThrow();
    });
    it('preserves confirmed history after edits and rejects stale revisions', async () => {
      const row = await service.create(owner, income);
      await service.confirm(owner, row.id, start, { amount: 95, date: today });
      const current = (await service.list(owner))[0];
      await service.update(owner, row.id, {
        revision: current.revision,
        amount: 200,
        paused: true,
      });
      await expect(
        service.update(owner, row.id, {
          revision: current.revision,
          amount: 300,
        }),
      ).rejects.toThrow('mudou');
      const result = await service.calendar(owner, month);
      expect(result.events.find((e) => e.status === 'SETTLED')).toMatchObject({
        description: income.description,
        actualAmount: 95,
      });
    });
    it('keeps one receipt per competence even when a future due day changes', async () => {
      const nextMonth = new Date(
        Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1),
      )
        .toISOString()
        .slice(0, 7);
      const row = await service.create(owner, {
        ...income,
        startDate: `${nextMonth}-05`,
      });
      const receipt = await service.confirm(owner, row.id, `${nextMonth}-05`, {
        amount: 105,
        date: today,
      });
      const current = (await service.list(owner))[0];
      await service.update(owner, row.id, {
        revision: current.revision,
        startDate: `${nextMonth}-15`,
        amount: 200,
      });
      const result = await service.calendar(owner, nextMonth);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        status: 'SETTLED',
        dueDate: `${nextMonth}-05`,
        actualAmount: 105,
      });
      const repeated = await service.confirm(owner, row.id, `${nextMonth}-15`, {
        amount: 200,
        date: today,
      });
      expect(repeated.transactionId).toBe(receipt.transactionId);
      expect(await db.transaction.count()).toBe(1);
    });
    it('rejects archived categories on confirmation without creating any transaction', async () => {
      const category = await categories.create(
        { name: 'Renda', type: 'INCOME', color: '#112233', icon: 'Tag' },
        owner,
      );
      const row = await service.create(owner, {
        ...income,
        category: category.id,
      });
      await categories.update(category.id, { archived: true }, owner);
      await expect(
        service.confirm(owner, row.id, start, { amount: 100, date: today }),
      ).rejects.toThrow('arquivada');
      expect(await db.transaction.count()).toBe(0);
    });
    it('rolls back transactions if receipt persistence fails', async () => {
      const row = await service.create(owner, income);
      const original = db.$transaction.bind(db);
      const spy = jest.spyOn(db, '$transaction').mockImplementationOnce((async (
        callback,
      ) =>
        original(async (tx) => {
          const proxy = Object.create(tx);
          proxy.calendarReceipt = {
            ...tx.calendarReceipt,
            findUnique: tx.calendarReceipt.findUnique.bind(tx.calendarReceipt),
            create: async () => {
              throw new Error('receipt unavailable');
            },
          };
          return callback(proxy);
        })) as never);
      await expect(
        service.confirm(owner, row.id, start, { amount: 100, date: today }),
      ).rejects.toThrow('receipt unavailable');
      spy.mockRestore();
      expect(await db.transaction.count()).toBe(0);
      expect(await db.calendarReceipt.count()).toBe(0);
      await service.confirm(owner, row.id, start, { amount: 100, date: today });
      expect(await db.transaction.count()).toBe(1);
    });
    it('replaces paid expenses with actuals, preserves paid cycles and unmarks atomically', async () => {
      const due = new Date(`${start}T12:00:00Z`);
      const expense = await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Aluguel',
          amount: 50,
          category: 'HOUSING',
          dueDate: due,
          recurrence: 'MONTHLY',
          recurrenceDay: 1,
        },
      });
      const raw = new FixedExpenseRawFieldsService(db as never);
      const payment = new FixedExpensePaymentService(
        categories,
        new FixedExpensePaymentsRepository(db as never, raw),
        encryption,
      );
      const results = await Promise.allSettled([
        payment.markAsPaid(expense, owner),
        payment.markAsPaid(expense, owner),
      ]);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      expect(await db.transaction.count()).toBe(1);
      const calendar = await service.calendar(owner, month);
      expect(calendar.events[0].status).toBe('SETTLED');
      expect(calendar.projection.projectedBalance).toBe(-50);
      const paid = await db.fixedExpense.findUnique({
        where: { id: expense.id },
      });
      await payment.unmarkAsPaid(paid, owner);
      expect(await db.transaction.count()).toBe(0);
      expect(await db.calendarReceipt.count()).toBe(0);
      await payment.markAsPaid(expense, owner);
      const next = new Date(
        Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 1, 12),
      );
      await new FixedExpensesRepository(db as never, encryption).refreshCycle(
        expense.id,
        next,
        due,
      );
      expect((await service.calendar(owner, month)).events[0].status).toBe(
        'SETTLED',
      );
    });
    it('uses all prior actuals as base and includes overdue once', async () => {
      const before = new Date(`${start}T12:00:00Z`);
      before.setUTCDate(0);
      await db.transaction.create({
        data: buildEncryptedTransactionData(
          {
            userId: owner,
            value: 100,
            type: 'INCOME',
            date: before,
            category: 'SALARY',
            description: 'Base',
          },
          encryption,
        ) as Prisma.TransactionUncheckedCreateInput,
      });
      await db.fixedExpense.create({
        data: {
          userId: owner,
          name: 'Pendente',
          amount: 150,
          category: 'HOUSING',
          dueDate: new Date(`${today}T12:00:00Z`),
          recurrence: 'YEARLY',
        },
      });
      const result = await service.calendar(owner, month);
      expect(result.projection.baseBalance).toBe(100);
      expect(result.projection.firstNegativeDate).toBe(today);
      expect(result.projection.projectedBalance).toBe(-50);
    });
    it('enforces authentication and validates dates and money over HTTP', async () => {
      const http = request(app.getHttpServer());
      await http.get(`/calendar?month=${month}`).expect(401);
      await http
        .get('/calendar?month=2026-99')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await http
        .post('/calendar/incomes')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...income, startDate: '2026-02-31' })
        .expect(400);
      await http
        .post('/calendar/incomes')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...income, amount: -1 })
        .expect(400);
      await http
        .post('/calendar/incomes')
        .set('Authorization', `Bearer ${token}`)
        .send(income)
        .expect(201);
    });
  },
);
