import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import * as request from 'supertest';
import { PrismaService } from 'src/prisma/prisma.service';
import jwtConfig from 'src/common/config/jwt.config';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoriesService } from '../categories/categories.service';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import {
  decryptTransaction,
  EncryptedTransactionRecord,
} from '../transactions/transaction-encryption.mapper';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';
import { ConfirmImport, IMPORT_MAX_BYTES, ImportOptions } from './import.dto';

// Opt in with a localhost replica set. Always uses a new random database, never
// DATABASE_URL, and drops only that generated database when the suite finishes.
const enabled = !!process.env.IMPORT_TEST_DATABASE_URL;
(enabled ? describe : describe.skip)(
  'statement imports with real MongoDB',
  () => {
    let db: PrismaClient;
    let service: ImportsService;
    let repository: ImportsRepository;
    let categories: CategoriesService;
    let encryption: FinancialDataEncryptionService;
    let app: INestApplication;
    let token: string;
    const owner = '64f000000000000000000001';
    const other = '64f000000000000000000002';
    const options: ImportOptions = {
      format: 'CSV',
      encoding: 'utf-8',
      source: 'bank:checking',
      csv: {
        delimiter: ';',
        dateFormat: 'DD/MM/YYYY',
        decimalSeparator: ',',
        header: true,
        columns: { date: 0, description: 1, value: 2 },
      },
    };
    const preview = (
      rows = '28/09/2026;Café;-10',
      opts = options,
      user = owner,
    ) =>
      service.preview(
        Buffer.from('date;description;value\n' + rows),
        opts,
        user,
      );
    const selection = (rowId = 1, extra = {}): ConfirmImport => ({
      rows: [{ rowId, selected: true, allowDuplicate: false, ...extra }],
    });
    const originalKey = process.env.FINANCIAL_DATA_ENCRYPTION_KEY;

    beforeAll(async () => {
      const url = new URL(process.env.IMPORT_TEST_DATABASE_URL);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.protocol !== 'mongodb:'
      )
        throw new Error('Tests require an explicit local MongoDB URL.');
      url.pathname = `/myfinances_import_test_${randomBytes(8).toString('hex')}`;
      process.env.FINANCIAL_DATA_ENCRYPTION_KEY =
        'imports-integration-test-key-only';
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
      const jwt = new JwtService({ secret: 'imports-test-jwt' });
      const module = await Test.createTestingModule({
        controllers: [ImportsController],
        providers: [
          ImportsService,
          ImportsRepository,
          TransactionsRepository,
          CategoriesService,
          CategoriesRepository,
          FinancialDataEncryptionService,
          { provide: PrismaService, useValue: db },
          { provide: JwtService, useValue: jwt },
          { provide: jwtConfig.KEY, useValue: { secret: 'imports-test-jwt' } },
        ],
      }).compile();
      service = module.get(ImportsService);
      repository = module.get(ImportsRepository);
      categories = module.get(CategoriesService);
      encryption = module.get(FinancialDataEncryptionService);
      token = jwt.sign({ sub: owner });
      app = module.createNestApplication();
      await app.init();
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      if (db) {
        await db.$runCommandRaw({ dropDatabase: 1 });
        await db.$disconnect();
      }
      if (originalKey === undefined)
        delete process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
      else process.env.FINANCIAL_DATA_ENCRYPTION_KEY = originalKey;
    });
    beforeEach(async () => {
      jest.restoreAllMocks();
      await db.transactionImportResult.deleteMany();
      await db.transactionImport.deleteMany();
      await db.transaction.deleteMany();
      await db.categoryRule.deleteMany();
      await db.category.deleteMany();
    });

    it('previews without transactions, encrypts stored data and cancels safely', async () => {
      const batch = await preview();
      expect(batch.rows[0]).toMatchObject({
        category: 'OTHER',
        categorySource: 'default',
        selected: true,
      });
      expect(await db.transaction.count()).toBe(0);
      const stored = await repository.find(batch.batchId, owner);
      expect(stored.encryptedData).not.toContain('Café');
      expect(encryption.decrypt(stored.encryptedData)).toMatchObject({
        source: options.source,
      });
      expect((await service.get(batch.batchId, owner)).summary.pending).toBe(1);
      await service.cancel(batch.batchId, owner);
      expect(
        (await repository.find(batch.batchId, owner)).encryptedData,
      ).toBeNull();
      await expect(
        service.confirm(batch.batchId, selection(), owner),
      ).rejects.toThrow('expirada');
      expect(await db.transaction.count()).toBe(0);
    });

    it('uses current category rules and lets individual/bulk explicit categories prevail', async () => {
      const custom = await categories.create(
        { name: 'Cafeteria', type: 'EXPENSE', color: '#123456', icon: 'Tag' },
        owner,
      );
      await categories.createRule(
        {
          type: 'EXPENSE',
          contains: 'CAFÉ',
          category: custom.id,
          priority: 1,
          enabled: true,
        },
        owner,
      );
      const batch = await preview(
        '28/09/2026;cafe;-10\n29/09/2026;Café;-20\n30/09/2026;Café;-30',
      );
      expect(
        batch.rows.every(
          (r) => r.category === custom.id && r.categorySource === 'rule',
        ),
      ).toBe(true);
      const result = await service.confirm(
        batch.batchId,
        {
          rows: [
            {
              rowId: 1,
              selected: true,
              category: 'FOOD',
              allowDuplicate: false,
            },
            {
              rowId: 2,
              selected: true,
              category: 'FOOD',
              allowDuplicate: false,
            },
            { rowId: 3, selected: false, allowDuplicate: false },
          ],
        },
        owner,
      );
      expect(result.summary).toEqual({
        imported: 2,
        ignored: 1,
        rejected: 0,
        pending: 0,
      });
      for (const transaction of await db.transaction.findMany()) {
        const decrypted = decryptTransaction(
          transaction as unknown as EncryptedTransactionRecord,
          encryption,
        );
        expect(decrypted.category).toBe('FOOD');
        expect(decrypted.value).toBeGreaterThan(0);
        expect(decrypted.type).toBe('EXPENSE');
        expect(transaction.encryptedData).not.toHaveProperty(
          'description',
          'cafe',
        );
      }
    });

    it('revalidates archived categories, rejects foreign categories and supports correction on retry', async () => {
      const custom = await categories.create(
        { name: 'Food', type: 'EXPENSE', color: '#123456', icon: 'Tag' },
        owner,
      );
      const foreign = await categories.create(
        { name: 'Private', type: 'EXPENSE', color: '#123456', icon: 'Tag' },
        other,
      );
      const batch = await preview();
      await categories.update(custom.id, { archived: true }, owner);
      for (const category of [custom.id, foreign.id, 'SALARY']) {
        expect(
          (
            await service.confirm(
              batch.batchId,
              selection(1, { category }),
              owner,
            )
          ).results[0],
        ).toMatchObject({ status: 'REJECTED', reason: 'INVALID_CATEGORY' });
      }
      expect(await db.transaction.count()).toBe(0);
      expect(
        (
          await service.confirm(
            batch.batchId,
            selection(1, { category: 'FOOD' }),
            owner,
          )
        ).summary.imported,
      ).toBe(1);
    });

    it('re-evaluates changed rules at confirmation and keeps mapped categories explicit', async () => {
      const rule = await categories.createRule(
        {
          type: 'EXPENSE',
          contains: 'cafe',
          category: 'FOOD',
          priority: 1,
          enabled: true,
        },
        owner,
      );
      const batch = await preview();
      expect(batch.rows[0].category).toBe('FOOD');
      await categories.updateRule(rule.id, { category: 'OTHER' }, owner);
      const result = await service.confirm(batch.batchId, selection(), owner);
      const record = await db.transaction.findUnique({
        where: { id: result.results[0].transactionId },
      });
      expect(
        encryption.decrypt(
          (record.encryptedData as Record<string, string>).category,
        ),
      ).toBe('OTHER');
    });

    it('detects duplicates within a file, defaults them off, and requires explicit override', async () => {
      const batch = await preview('28/09/2026;Café;-10\n28/09/2026;CAFE;-10');
      expect(
        batch.rows.every((r) => !r.selected && r.duplicates[0].kind === 'FILE'),
      ).toBe(true);
      expect(
        (await service.confirm(batch.batchId, selection(), owner)).results[0]
          .reason,
      ).toBe('DUPLICATE_REQUIRES_APPROVAL');
      expect(
        (
          await service.confirm(
            batch.batchId,
            selection(1, { allowDuplicate: true }),
            owner,
          )
        ).summary.imported,
      ).toBe(1);
      const reimport = await preview('28/09/2026;  cafe  ;-10');
      expect(reimport.rows[0].duplicates).toContainEqual(
        expect.objectContaining({ kind: 'HISTORY', reason: 'FINGERPRINT' }),
      );
      const own = await preview('28/09/2026;  cafe  ;-10', options, other);
      expect(own.rows[0].duplicates).toEqual([]);
    });

    it('scopes external IDs by source, retains them after expiry and rechecks new history', async () => {
      const opts: ImportOptions = {
        ...options,
        csv: {
          ...options.csv,
          columns: { ...options.csv.columns, externalId: 3 },
        },
      };
      const file = (date: string, source: string) =>
        service.preview(
          Buffer.from(`d;desc;value;id\n${date};Compra;-20;FIT-123`),
          { ...opts, source },
          owner,
        );
      const first = await file('28/09/2026', 'bank:one');
      const second = await file('29/09/2026', 'bank:one');
      expect(second.rows[0].duplicates).toEqual([]);
      const imported = await service.confirm(first.batchId, selection(), owner);
      await service.cancel(first.batchId, owner);
      expect(
        (await service.confirm(second.batchId, selection(), owner)).results[0]
          .reason,
      ).toBe('DUPLICATE_REQUIRES_APPROVAL');
      expect(
        (await file('30/09/2026', 'bank:one')).rows[0].duplicates[0].reason,
      ).toBe('EXTERNAL_ID');
      expect((await file('30/09/2026', 'bank:two')).rows[0].duplicates).toEqual(
        [],
      );
      const tx = await db.transaction.findUnique({
        where: { id: imported.results[0].transactionId },
      });
      expect(tx.encryptedImportIdentity).not.toContain('FIT-123');
    });

    it('repeated and simultaneous confirmations create exactly one transaction per line', async () => {
      const batch = await preview('28/09/2026;A;-10\n29/09/2026;B;-20');
      const choices: ConfirmImport = {
        rows: [1, 2].map((rowId) => ({
          rowId,
          selected: true,
          allowDuplicate: false,
        })),
      };
      await Promise.all(
        Array.from({ length: 5 }, () =>
          service.confirm(batch.batchId, choices, owner),
        ),
      );
      const retry = await service.confirm(batch.batchId, choices, owner);
      expect(retry.summary).toEqual({
        imported: 2,
        ignored: 0,
        rejected: 0,
        pending: 0,
      });
      expect(await db.transaction.count()).toBe(2);
      expect(
        await db.transactionImportResult.count({
          where: { status: 'IMPORTED' },
        }),
      ).toBe(2);
      // Deleting an imported transaction never makes its receipt reusable.
      await db.transaction.deleteMany();
      expect(
        (await service.confirm(batch.batchId, choices, owner)).summary.imported,
      ).toBe(2);
      expect(await db.transaction.count()).toBe(0);
    });

    it('reports partial failure and resumes only pending lines', async () => {
      const batch = await preview('28/09/2026;A;-10\n29/09/2026;B;-20');
      const save = repository.saveResult.bind(repository);
      const spy = jest
        .spyOn(repository, 'saveResult')
        .mockImplementationOnce(save)
        .mockRejectedValueOnce(new Error('database failed'));
      const choices: ConfirmImport = {
        rows: [1, 2].map((rowId) => ({
          rowId,
          selected: true,
          allowDuplicate: false,
        })),
      };
      const failed = await service.confirm(batch.batchId, choices, owner);
      expect(failed.summary).toEqual({
        imported: 1,
        ignored: 0,
        rejected: 0,
        pending: 1,
      });
      expect(failed.results[1].reason).toBe('RETRY_REQUIRED');
      expect((await service.get(batch.batchId, owner)).summary.pending).toBe(1);
      spy.mockRestore();
      expect(
        (await service.confirm(batch.batchId, selection(2), owner)).summary
          .imported,
      ).toBe(2);
      expect(await db.transaction.count()).toBe(2);
    });

    it('rolls back a created transaction when its receipt fails', async () => {
      const batch = await preview();
      const create = jest.spyOn(db, '$transaction');
      const realTransaction = db.$transaction.bind(db);
      create.mockImplementationOnce((async (callback) =>
        realTransaction(async (tx) => {
          const failing = Object.create(tx);
          failing.transactionImportResult = {
            ...tx.transactionImportResult,
            findUnique: tx.transactionImportResult.findUnique.bind(
              tx.transactionImportResult,
            ),
            upsert: async () => {
              throw new Error('receipt failure');
            },
          };
          return callback(failing);
        })) as never);
      expect(
        (await service.confirm(batch.batchId, selection(), owner)).summary
          .pending,
      ).toBe(1);
      expect(await db.transaction.count()).toBe(0);
      expect(await db.transactionImportResult.count()).toBe(0);
      create.mockRestore();
      expect(
        (await service.confirm(batch.batchId, selection(), owner)).summary
          .imported,
      ).toBe(1);
    });

    it('does not expose or mutate another owner batch and rejects unknown rows', async () => {
      const batch = await preview();
      await expect(service.get(batch.batchId, other)).rejects.toThrow(
        'não encontrado',
      );
      await expect(
        service.confirm(batch.batchId, selection(), other),
      ).rejects.toThrow('não encontrado');
      await expect(service.cancel(batch.batchId, other)).rejects.toThrow(
        'não encontrado',
      );
      await expect(
        service.confirm(batch.batchId, selection(2), owner),
      ).rejects.toThrow('inexistente');
      await expect(service.get('bad-id', owner)).rejects.toThrow(
        'não encontrado',
      );
    });

    it('expires and physically clears encrypted previews, preserving receipts', async () => {
      const batch = await preview();
      await service.confirm(batch.batchId, selection(), owner);
      await db.transactionImport.update({
        where: { id: batch.batchId },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        service.confirm(batch.batchId, selection(), owner),
      ).rejects.toThrow('expirada');
      await repository.purgeExpired();
      expect(
        (await repository.find(batch.batchId, owner)).encryptedData,
      ).toBeNull();
      const result = await service.get(batch.batchId, owner);
      expect(result.expired).toBe(true);
      expect(result.rows).toEqual([]);
      expect(result.results[0].status).toBe('IMPORTED');
    });

    it('rejects invalid lines and lets a mapped invalid category be corrected', async () => {
      const opts: ImportOptions = {
        ...options,
        csv: {
          ...options.csv,
          columns: { ...options.csv.columns, category: 3 },
        },
      };
      const batch = await service.preview(
        Buffer.from(
          'd;desc;value;category\n31/02/2026;Bad;-1;FOOD\n28/09/2026;Cafe;-20;INVALID',
        ),
        opts,
        owner,
      );
      expect(batch.rows.every((r) => r.errors.length > 0)).toBe(true);
      const result = await service.confirm(
        batch.batchId,
        {
          rows: [1, 2].map((rowId) => ({
            rowId,
            selected: true,
            category: 'FOOD',
            allowDuplicate: false,
          })),
        },
        owner,
      );
      expect(result.summary).toEqual({
        imported: 1,
        ignored: 0,
        rejected: 1,
        pending: 0,
      });
    });

    it('enforces auth, multipart/body validation and upload limits over HTTP', async () => {
      const http = request(app.getHttpServer());
      await http.post('/transaction-imports/preview').expect(401);
      await http
        .post('/transaction-imports/preview')
        .set('Authorization', `Bearer ${token}`)
        .field('options', '{}')
        .attach('file', Buffer.from('test'), 'test.csv')
        .expect(400);
      await http
        .post('/transaction-imports/preview')
        .set('Authorization', `Bearer ${token}`)
        .field('options', JSON.stringify(options))
        .attach('file', Buffer.alloc(IMPORT_MAX_BYTES + 1), 'large.csv')
        .expect(413);
      const response = await http
        .post('/transaction-imports/preview')
        .set('Authorization', `Bearer ${token}`)
        .field('options', JSON.stringify(options))
        .attach(
          'file',
          Buffer.from('date;description;value\n28/09/2026;Café;-10'),
          'test.csv',
        )
        .expect(201);
      await http
        .post(`/transaction-imports/${response.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ rowId: 1, selected: true, value: 1 }] })
        .expect(400);
      const confirmed = await http
        .post(`/transaction-imports/${response.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send(selection())
        .expect(201);
      expect(confirmed.body.summary.imported).toBe(1);
      await http
        .get(`/transaction-imports/${response.body.batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await http
        .delete(`/transaction-imports/${response.body.batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  },
);
