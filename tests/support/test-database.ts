import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { promisify } from 'util';

/** Cria somente bancos locais com nome aleatório; nunca limpa DATABASE_URL. */
export async function createTestDatabase() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (
    url.protocol !== 'mongodb:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error('Testes exigem MongoDB local explícito.');
  }
  url.pathname = `/myfinances_test_${randomBytes(12).toString('hex')}`;
  await promisify(execFile)(
    process.execPath,
    [
      resolve('node_modules/prisma/build/index.js'),
      'db',
      'push',
      '--skip-generate',
    ],
    { env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 30000 },
  );
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    await db.$connect();
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
  return {
    db,
    async close() {
      try {
        await db.$runCommandRaw({ dropDatabase: 1 });
      } finally {
        await db.$disconnect();
      }
    },
  };
}
