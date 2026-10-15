import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import * as request from 'supertest';
import jwtConfig from 'src/common/config/jwt.config';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { NotificationsController } from 'src/modules/notifications/notifications.controller';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { NotificationsRepository } from 'src/modules/notifications/repositories/notifications.repository';
import { NotificationSyncRepository } from 'src/modules/notifications/repositories/notification-sync.repository';
import { NotificationSyncService } from 'src/modules/notifications/services/notification-sync.service';
import { FixedExpenseRecurrenceService } from 'src/modules/fixed-expenses/services/fixed-expense-recurrence.service';
import { FixedExpensesRepository } from 'src/modules/fixed-expenses/repositories/fixed-expenses.repository';
import { FixedExpensePaymentsRepository } from 'src/modules/fixed-expenses/repositories/fixed-expense-payments.repository';
import { FixedExpenseRawFieldsService } from 'src/modules/fixed-expenses/services/fixed-expense-raw-fields.service';
import { todayKey } from 'src/common/date/civil-date';

const execFileAsync = promisify(execFile);

// Usa exclusivamente um banco local com nome aleatório. Nunca usa DATABASE_URL.
(process.env.NOTIFICATIONS_TEST_DATABASE_URL ? describe : describe.skip)(
  'Notificações com MongoDB real',
  () => {
    let db: PrismaClient;
    let synchronizer: NotificationSyncService;
    let app: INestApplication;
    let token: string;
    const owner = '64f000000000000000000001';
    const other = '64f000000000000000000002';
    const today = todayKey();
    const date = (offset: number) =>
      new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000);
    const createExpense = (offset = 1, userId = owner) =>
      db.fixedExpense.create({
        data: {
          userId,
          name: 'Internet',
          amount: 100,
          dueDate: date(offset),
          recurrence: 'MONTHLY',
        },
      });
    beforeAll(async () => {
      const url = new URL(process.env.NOTIFICATIONS_TEST_DATABASE_URL!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.protocol !== 'mongodb:'
      )
        throw new Error('Use apenas MongoDB local explícito.');
      url.pathname = `/myfinances_notifications_test_${randomBytes(8).toString('hex')}`;
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
      const repository = new NotificationSyncRepository(db as never);
      // A criptografia de recibos antigos não é exercitada neste teste de rota;
      // o avanço de ciclo abaixo usa uma despesa sem transação legada vinculada.
      const recurrence = new FixedExpenseRecurrenceService(
        new FixedExpensesRepository(db as never, {} as never),
      );
      synchronizer = new NotificationSyncService(repository, recurrence);
      const jwt = new JwtService({ secret: 'notifications-test-only' });
      const module = await Test.createTestingModule({
        controllers: [NotificationsController],
        providers: [
          NotificationsService,
          NotificationsRepository,
          {
            provide: NotificationSyncService,
            useValue: synchronizer,
          },
          { provide: PrismaService, useValue: db },
          { provide: JwtService, useValue: jwt },
          {
            provide: jwtConfig.KEY,
            useValue: { secret: 'notifications-test-only' },
          },
        ],
      }).compile();
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
      await db.notification.deleteMany();
      await db.notificationDelivery.deleteMany();
      await db.notificationSyncState.deleteMany();
      await db.calendarReceipt.deleteMany();
      await db.transaction.deleteMany();
      await db.fixedExpense.deleteMany();
    });
    it('protege a rota e usa somente o usuário do token', async () => {
      await createExpense(1, owner);
      await createExpense(1, other);
      await request(app.getHttpServer())
        .post('/notifications/sync')
        .expect(401);
      const response = await request(app.getHttpServer())
        .post('/notifications/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: other, force: true })
        .expect(201);
      expect(response.body).toMatchObject({ processed: true, created: 1 });
      expect(await db.notification.count({ where: { userId: other } })).toBe(0);
      await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect(({ body }) => expect(body).toHaveLength(1));
    });
    it('três chamadas simultâneas criam um único aviso e só uma processa', async () => {
      await createExpense();
      const results = await Promise.all([
        synchronizer.evaluate(owner),
        synchronizer.evaluate(owner),
        synchronizer.evaluate(owner),
      ]);
      expect(results.filter((r) => r.processed)).toHaveLength(1);
      expect(await db.notification.count()).toBe(1);
      expect(await db.notificationDelivery.count()).toBe(1);
      // Confirma o índice real, além da coordenação pelo timestamp.
      const receipt = await db.notificationDelivery.findFirstOrThrow();
      const data = { ...receipt };
      delete data.id;
      await expect(
        db.notificationDelivery.create({ data }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
    it('permite avaliação forçada após uma mutação dentro dos cinco minutos', async () => {
      await synchronizer.evaluate(owner);
      await createExpense();
      expect((await synchronizer.evaluate(owner)).processed).toBe(false);
      expect((await synchronizer.evaluate(owner, true)).created).toBe(1);
    });
    it('recupera atrasados e inclui o terceiro dia até 23:59', async () => {
      await createExpense(-12);
      const third = await createExpense(3);
      await db.fixedExpense.update({
        where: { id: third.id },
        data: {
          dueDate: new Date(`${date(3).toISOString().slice(0, 10)}T23:59:59Z`),
        },
      });
      await createExpense(4);
      const result = await synchronizer.evaluate(owner);
      expect(result.created).toBe(2);
      expect(
        await db.notification.findFirst({ where: { event: 'OVERDUE' } }),
      ).toMatchObject({
        type: 'ALERT',
        message: expect.stringContaining('12 dias'),
      });
    });
    it('pagar resolve atomicamente o aviso; desmarcar reabre a mesma notificação', async () => {
      const expense = await createExpense();
      await synchronizer.evaluate(owner);
      const original = await db.notification.findFirstOrThrow();
      const payments = new FixedExpensePaymentsRepository(
        db as never,
        new FixedExpenseRawFieldsService(db as never),
      );
      const transactionId = '64f000000000000000000010';
      // A resolução independe da action/rodada posterior, pois pertence à transação do pagamento.
      const paid = await payments.markPaid(
        expense,
        owner,
        date(0),
        {
          id: transactionId,
          userId: owner,
          type: 'EXPENSE',
          dateIndex: Number(today.replaceAll('-', '')),
          encryptedData: {},
        },
        () => 'receipt-test-only',
      );
      expect(
        await db.notification.findUnique({ where: { id: original.id } }),
      ).toMatchObject({
        read: true,
        resolution: 'PAID',
        resolvedAt: expect.any(Date),
      });
      await payments.unmarkPaid(paid, owner, transactionId);
      await synchronizer.evaluate(owner, true);
      expect(await db.notification.count()).toBe(1);
      expect(
        await db.notification.findUnique({ where: { id: original.id } }),
      ).toMatchObject({ read: false, resolvedAt: null, resolution: null });
    });
    it('pagamento e sincronização concorrentes preservam uma única transação e aviso resolvido', async () => {
      const expense = await createExpense();
      await synchronizer.evaluate(owner);
      const payments = new FixedExpensePaymentsRepository(
        db as never,
        new FixedExpenseRawFieldsService(db as never),
      );
      await Promise.all([
        synchronizer.evaluate(owner, true),
        payments.markPaid(
          expense,
          owner,
          date(0),
          {
            userId: owner,
            type: 'EXPENSE',
            dateIndex: Number(today.replaceAll('-', '')),
            encryptedData: {},
          },
          () => 'receipt-test-only',
        ),
      ]);
      expect(await db.transaction.count()).toBe(1);
      expect(await db.notification.findFirstOrThrow()).toMatchObject({
        resolution: 'PAID',
        read: true,
      });
    });
    it('alterar vencimento encerra o aviso antigo e excluir encerra o novo', async () => {
      const expense = await createExpense();
      await synchronizer.evaluate(owner);
      const original = await db.notification.findFirstOrThrow();
      await db.fixedExpense.update({
        where: { id: expense.id },
        data: { dueDate: date(2) },
      });
      await synchronizer.evaluate(owner, true);
      expect(
        await db.notification.findUnique({ where: { id: original.id } }),
      ).toMatchObject({ resolution: 'DUE_DATE_CHANGED', read: true });
      expect(await db.notification.count()).toBe(2);
      await db.fixedExpense.delete({ where: { id: expense.id } });
      await synchronizer.evaluate(owner, true);
      expect(await db.notification.count({ where: { resolvedAt: null } })).toBe(
        0,
      );
      expect(
        await db.notification.count({
          where: { resolution: 'EXPENSE_DELETED' },
        }),
      ).toBe(1);
    });
    it('atualiza nome/valor sem duplicar ou tornar um aviso lido não lido', async () => {
      const expense = await createExpense();
      await synchronizer.evaluate(owner);
      const original = await db.notification.findFirstOrThrow();
      await db.notification.update({
        where: { id: original.id },
        data: { read: true },
      });
      await db.fixedExpense.update({
        where: { id: expense.id },
        data: { name: 'Internet nova', amount: 120 },
      });
      await synchronizer.evaluate(owner, true);
      expect(await db.notification.count()).toBe(1);
      expect(await db.notification.findFirstOrThrow()).toMatchObject({
        read: true,
        message: expect.stringContaining('Internet nova" de R$ 120.00'),
      });
    });
    it('virar atraso substitui o lembrete e não cria alertas diários repetidos', async () => {
      const expense = await createExpense(-1);
      const dueDateKey = date(-1).toISOString().slice(0, 10);
      const old = await db.notification.create({
        data: {
          userId: owner,
          sourceExpenseId: expense.id,
          dueDateKey,
          event: 'UPCOMING',
          title: 'Lembrete',
          message: 'Vence amanhã',
          type: 'REMINDER',
        },
      });
      await db.notificationDelivery.create({
        data: {
          userId: owner,
          expenseId: expense.id,
          dueDateKey,
          event: 'UPCOMING',
          notificationId: old.id,
        },
      });
      await synchronizer.evaluate(owner);
      await synchronizer.evaluate(owner, true);
      expect(
        await db.notification.findUnique({ where: { id: old.id } }),
      ).toMatchObject({ read: true, resolution: 'SUPERSEDED' });
      expect(await db.notification.count({ where: { event: 'OVERDUE' } })).toBe(
        1,
      );
    });
    it('excluir um aviso preserva seu recibo e não o recria', async () => {
      await createExpense();
      await synchronizer.evaluate(owner);
      const notification = await db.notification.findFirstOrThrow();
      await request(app.getHttpServer())
        .delete(`/notifications/${notification.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await synchronizer.evaluate(owner, true);
      expect(await db.notification.count()).toBe(0);
      expect(await db.notificationDelivery.count()).toBe(1);
    });
    it('preserva a deduplicação de lembretes legados e permite alerta de atraso', async () => {
      const expense = await createExpense();
      await db.fixedExpense.update({
        where: { id: expense.id },
        data: { lastNotificationDueDate: expense.dueDate },
      });
      expect((await synchronizer.evaluate(owner)).created).toBe(0);
      const late = await createExpense(-1);
      await db.fixedExpense.update({
        where: { id: late.id },
        data: { lastNotificationDueDate: late.dueDate },
      });
      expect((await synchronizer.evaluate(owner, true)).created).toBe(1);
    });
    it('falha faz rollback de aviso, recibo e timestamp; a próxima chamada recupera', async () => {
      await createExpense();
      // Intercepta o callback real para induzir erro depois da criação do aviso,
      // dentro da transação do MongoDB e sem simular seu rollback.
      const transaction = db.$transaction.bind(db);
      const injected = jest.spyOn(db, '$transaction').mockImplementationOnce(((
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transaction(async (tx) => {
          const delegate = tx.notificationDelivery;
          delegate.create = () => {
            throw new Error('falha simulada');
          };
          return callback(tx);
        })) as never);
      await expect(synchronizer.evaluate(owner)).rejects.toThrow(
        'falha simulada',
      );
      injected.mockRestore();
      expect(await db.notification.count()).toBe(0);
      expect(await db.notificationSyncState.count()).toBe(0);
      expect(await db.notificationDelivery.count()).toBe(0);
      expect((await synchronizer.evaluate(owner)).created).toBe(1);
    });
    it('a rota atualiza o ciclo pago antes de avaliar as notificações', async () => {
      const expense = await createExpense(-1);
      await db.fixedExpense.update({
        where: { id: expense.id },
        data: { isPaid: true },
      });
      await request(app.getHttpServer())
        .post('/notifications/sync')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const refreshed = await db.fixedExpense.findUniqueOrThrow({
        where: { id: expense.id },
      });
      expect(refreshed.isPaid).toBe(false);
      expect(refreshed.dueDate.getTime()).toBeGreaterThan(
        expense.dueDate.getTime(),
      );
    });
    it('uma mudança de dia ignora o intervalo ainda recente', async () => {
      await synchronizer.evaluate(owner);
      await createExpense();
      await db.notificationSyncState.update({
        where: { id: owner },
        data: { dayKey: date(-1).toISOString().slice(0, 10) },
      });
      expect((await synchronizer.evaluate(owner)).created).toBe(1);
    });
    it('sincronizações simultâneas avançam um ciclo pago uma única vez', async () => {
      const expense = await createExpense(-1);
      await db.fixedExpense.update({
        where: { id: expense.id },
        data: { isPaid: true },
      });
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(app.getHttpServer())
            .post('/notifications/sync')
            .set('Authorization', `Bearer ${token}`),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201,
      ]);
      const refreshed = await db.fixedExpense.findUniqueOrThrow({
        where: { id: expense.id },
      });
      const expectedMonth = new Date(
        Date.UTC(
          expense.dueDate.getUTCFullYear(),
          expense.dueDate.getUTCMonth() + 1,
          1,
        ),
      );
      expect(refreshed.dueDate.toISOString().slice(0, 7)).toBe(
        expectedMonth.toISOString().slice(0, 7),
      );
      expect(refreshed.isPaid).toBe(false);
    });
  },
);
