import * as bcrypt from 'bcryptjs';
import { TransactionType } from '@prisma/client';
import { subMonths } from 'date-fns';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/transaction-encryption.mapper';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from 'src/common/constants/categories.constants';

const TEST_USER_EMAIL = 'teste@teste.com';
const TEST_USER_PASSWORD = '12345678';
const TEST_USER_NAME = 'Usuário de Teste';
const TRANSACTION_COUNT = 200;
const SEEDED_DESCRIPTION_PREFIX = '[DEV-SEED]';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Este script é exclusivo para desenvolvimento e não pode ser executado em produção.',
    );
  }

  const prisma = new PrismaService();
  const encryptionService = new FinancialDataEncryptionService();

  await prisma.$connect();

  try {
    const password = await bcrypt.hash(TEST_USER_PASSWORD, 10);
    const user = await prisma.user.upsert({
      where: { email: TEST_USER_EMAIL },
      update: {
        name: TEST_USER_NAME,
        password,
      },
      create: {
        email: TEST_USER_EMAIL,
        name: TEST_USER_NAME,
        password,
      },
      select: { id: true },
    });

    const now = new Date();
    const startDate = subMonths(now, 6);
    const dateRange = now.getTime() - startDate.getTime();

    const transactions = Array.from(
      { length: TRANSACTION_COUNT },
      (_, index) => {
        const isIncome = index % 4 === 0;
        const type = isIncome
          ? TransactionType.INCOME
          : TransactionType.EXPENSE;
        const date = new Date(
          startDate.getTime() + (dateRange * index) / (TRANSACTION_COUNT - 1),
        );
        const category = isIncome
          ? INCOME_CATEGORIES[index % INCOME_CATEGORIES.length]
          : EXPENSE_CATEGORIES[index % EXPENSE_CATEGORIES.length];
        const value = isIncome
          ? 1800 + ((index * 137) % 3200)
          : 25 + ((index * 83) % 650);

        return buildEncryptedTransactionData(
          {
            value,
            date,
            category,
            description: `${SEEDED_DESCRIPTION_PREFIX} Transação ${index + 1}`,
            type,
            userId: user.id,
          },
          encryptionService,
        );
      },
    );

    await prisma.transaction.createMany({ data: transactions as never });

    console.log(`Usuário pronto: ${TEST_USER_EMAIL}`);
    console.log(`Senha: ${TEST_USER_PASSWORD}`);
    console.log(
      `${TRANSACTION_COUNT} transações criadas para os últimos 6 meses.`,
    );
    console.log(`Identificação das transações: ${SEEDED_DESCRIPTION_PREFIX}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao criar dados de teste:', error);
  process.exitCode = 1;
});
