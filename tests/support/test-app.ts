import { getQueueToken, getSharedConfigToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { PublicExceptionFilter } from 'src/common/filters/public-exception.filter';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { TRANSACTION_EXPORT_QUEUE } from 'src/modules/transactions/exports/constants/exports.constants';
import { TransactionExportProcessor } from 'src/modules/transactions/exports/processors/transaction-export.processor';
import { createTestDatabase } from './test-database';

/** Usa aplicação, autenticação, repositórios e worker reais, com recursos exclusivos da suíte. */
export async function createTestApp() {
  const redis = new URL(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6380');
  if (
    redis.protocol !== 'redis:' ||
    !['localhost', '127.0.0.1'].includes(redis.hostname)
  ) {
    throw new Error('E2E exige Redis local explícito.');
  }
  const database = await createTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'myfinances-e2e-'));
  const previousStorage = process.env.EXPORT_STORAGE_PATH;
  process.env.EXPORT_STORAGE_PATH = directory;
  let app: NestExpressApplication;
  let queue: Queue;
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(database.db)
      .overrideProvider(getSharedConfigToken())
      .useValue({
        connection: { host: redis.hostname, port: Number(redis.port || 6379) },
        // O prefixo aleatório impede que workers de outras execuções consumam estes jobs.
        prefix: `myfinances-test-${randomBytes(12).toString('hex')}`,
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new PublicExceptionFilter());
    app.useBodyParser('json', { limit: '256kb' });
    await app.init();
    queue = module.get<Queue>(getQueueToken(TRANSACTION_EXPORT_QUEUE));

    return {
      app,
      db: database.db,
      directory,
      http: () => request(app.getHttpServer()),
      async register(
        email = `user-${randomBytes(6).toString('hex')}@example.test`,
      ) {
        const credentials = { email, password: 'test-password-123' };
        const created = await request(app.getHttpServer())
          .post('/user')
          .send({ name: 'Pessoa de teste', ...credentials })
          .expect(201);
        const login = await request(app.getHttpServer())
          .post('/auth')
          .send(credentials)
          .expect(201);
        return {
          id: created.body.user.id as string,
          token: login.body.accessToken as string,
          ...credentials,
        };
      },
      async close() {
        try {
          // Encerra o worker antes de remover somente a fila pertencente à suíte.
          await module.get(TransactionExportProcessor).worker.close();
          await queue.obliterate({ force: true });
        } finally {
          try {
            await app.close();
          } finally {
            try {
              await database.close();
            } finally {
              await rm(directory, { recursive: true, force: true });
            }
          }
        }
      },
    };
  } catch (error) {
    try {
      await app?.close();
    } finally {
      try {
        await database.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    throw error;
  } finally {
    if (previousStorage === undefined) delete process.env.EXPORT_STORAGE_PATH;
    else process.env.EXPORT_STORAGE_PATH = previousStorage;
  }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
export type TestUser = Awaited<ReturnType<TestApp['register']>>;
