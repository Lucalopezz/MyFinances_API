import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { WishlistModule } from 'src/modules/wishlist/wishlist.module';
import { WishlistService } from 'src/modules/wishlist/wishlist.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/mappers/transaction-encryption.mapper';

const execFileAsync = promisify(execFile);

// Nunca usa DATABASE_URL: cada execução cria e remove somente seu banco local aleatório.
(process.env.WISHLIST_TEST_DATABASE_URL ? describe : describe.skip)(
  'Reservas com MongoDB real',
  () => {
    let db: PrismaClient;
    let service: WishlistService;
    let encryption: FinancialDataEncryptionService;
    let module: TestingModule;
    const owner = '64f000000000000000000001';
    const other = '64f000000000000000000002';
    const date = '2026-10-14';

    beforeAll(async () => {
      const url = new URL(process.env.WISHLIST_TEST_DATABASE_URL!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.protocol !== 'mongodb:'
      ) {
        throw new Error('Use apenas MongoDB local explícito.');
      }
      url.pathname = `/myfinances_wishlist_test_${randomBytes(8).toString('hex')}`;
      await execFileAsync(
        process.execPath,
        [
          resolve('node_modules/prisma/build/index.js'),
          'db',
          'push',
          '--skip-generate',
        ],
        { env: { ...process.env, DATABASE_URL: url.toString() } },
      );
      db = new PrismaClient({ datasourceUrl: url.toString() });
      await db.$connect();
      // Compila o módulo real: além dos fluxos, verifica a composição dos providers Nest.
      module = await Test.createTestingModule({ imports: [WishlistModule] })
        .overrideProvider(PrismaService)
        .useValue(db)
        .compile();
      service = module.get(WishlistService);
      encryption = module.get(FinancialDataEncryptionService);
    }, 60000);

    afterAll(async () => {
      await module?.close();
      if (db) {
        await db.$runCommandRaw({ dropDatabase: 1 });
        await db.$disconnect();
      }
    });

    beforeEach(async () => {
      await db.wishlistMovement.deleteMany();
      await db.wishlistItem.deleteMany();
      await db.transaction.deleteMany();
      await db.user.deleteMany();
      await db.user.create({
        data: {
          id: owner,
          name: 'Teste',
          email: 'wishlist@example.test',
          password: 'teste',
        },
      });
      await db.transaction.create({
        data: buildEncryptedTransactionData(
          {
            userId: owner,
            type: 'INCOME',
            value: 100,
            date: new Date(`${date}T00:00:00Z`),
            category: 'SALARY',
          },
          encryption,
        ) as never,
      });
    });

    it('duas metas concorrentes não reservam mais que o saldo livre', async () => {
      const first = await service.createWishlistItem(
        { name: 'Notebook', desiredValue: 100 },
        owner,
      );
      const second = await service.createWishlistItem(
        { name: 'Celular', desiredValue: 100 },
        owner,
      );
      const results = await Promise.allSettled(
        [first, second].map((item) =>
          service.addMovement(
            item.id,
            { kind: 'DEPOSIT', value: 80, date },
            owner,
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason.message).toBe(
        'Saldo livre insuficiente para este aporte.',
      );
      expect(await service.getSummary(owner)).toEqual({
        financialBalance: 100,
        totalReserved: 80,
        freeBalance: 20,
        insufficient: false,
      });
      expect(await db.wishlistMovement.count()).toBe(1);
    });

    it('conclusões concorrentes criam uma despesa, consomem a reserva e liberam a sobra uma vez', async () => {
      const item = await service.createWishlistItem(
        { name: 'Compra', desiredValue: 100 },
        owner,
      );
      await service.addMovement(
        item.id,
        { kind: 'DEPOSIT', value: 80, date },
        owner,
      );
      const dto = {
        value: 60.01,
        date,
        category: 'OTHER',
        description: 'Compra concluída',
      };
      const results = await Promise.all([
        service.complete(item.id, dto, owner),
        service.complete(item.id, dto, owner),
      ]);
      expect(results.map((result) => result.alreadyCompleted).sort()).toEqual([
        false,
        true,
      ]);
      expect(results[0].transaction.id).toBe(results[1].transaction.id);
      for (const result of results) {
        expect(result).toMatchObject({
          coveredAmount: 60.01,
          releasedAmount: 19.99,
          uncoveredAmount: 0,
          item: { status: 'COMPLETED', reservedAmount: 0 },
        });
      }
      expect(await db.transaction.count({ where: { type: 'EXPENSE' } })).toBe(
        1,
      );
      expect(await db.wishlistMovement.count()).toBe(3);
      expect(await service.getSummary(owner)).toMatchObject({
        financialBalance: 39.99,
        totalReserved: 0,
        freeBalance: 39.99,
      });
    });

    it('falha após criar a despesa faz rollback também dos movimentos, vínculo e trava', async () => {
      const item = await service.createWishlistItem(
        { name: 'Compra', desiredValue: 100 },
        owner,
      );
      await service.addMovement(
        item.id,
        { kind: 'DEPOSIT', value: 80, date },
        owner,
      );
      const revision = (
        await db.user.findUniqueOrThrow({ where: { id: owner } })
      ).reservationRevision;
      const transaction = db.$transaction.bind(db);
      const injected = jest.spyOn(db, '$transaction').mockImplementationOnce(((
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transaction(async (tx) => {
          tx.wishlistMovement.create = () => {
            throw new Error('falha simulada');
          };
          return callback(tx);
        })) as never);
      await expect(
        service.complete(
          item.id,
          { value: 60, date, category: 'OTHER', description: 'Compra' },
          owner,
        ),
      ).rejects.toThrow('falha simulada');
      injected.mockRestore();
      expect(await db.transaction.count({ where: { type: 'EXPENSE' } })).toBe(
        0,
      );
      expect(await db.wishlistMovement.count()).toBe(1);
      expect(await service.getWishlistItem(item.id, owner)).toMatchObject({
        status: 'ACTIVE',
        reservedAmount: 80,
        purchaseTransactionId: null,
      });
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: owner } }))
          .reservationRevision,
      ).toBe(revision);
    });

    it('isola a meta por usuário e impede retirada superior à reserva', async () => {
      const item = await service.createWishlistItem(
        { name: 'Compra', desiredValue: 100 },
        owner,
      );
      await service.addMovement(
        item.id,
        { kind: 'DEPOSIT', value: 20, date },
        owner,
      );
      await expect(service.getWishlistItem(item.id, other)).rejects.toThrow(
        'Meta não encontrada.',
      );
      await expect(
        service.addMovement(
          item.id,
          { kind: 'WITHDRAWAL', value: 20.01, date },
          owner,
        ),
      ).rejects.toThrow('Retirada maior que a reserva da meta.');
      expect(await db.wishlistMovement.count()).toBe(1);
    });
  },
);
