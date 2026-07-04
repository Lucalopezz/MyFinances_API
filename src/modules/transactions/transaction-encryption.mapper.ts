import { TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

export type TransactionSensitiveData = {
  value: number;
  date: string;
  category: string;
  description?: string | null;
};

export type EncryptedTransactionRecord = {
  id: string;
  encryptedData: Record<keyof TransactionSensitiveData, string>;
  dateIndex: number;
  type: TransactionType;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
};

export type DecryptedTransaction = {
  id: string;
  value: number;
  date: Date;
  category: string;
  description?: string | null;
  type: TransactionType;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
};

export type PlainTransactionInput = {
  value: number;
  date: Date;
  category: string;
  description?: string | null;
  type: TransactionType;
  userId: string;
};

// Essa função é responsável por construir os dados de transação criptografados a partir dos dados de entrada fornecidos.
// Ela utiliza o serviço de criptografia para criptografar os campos sensíveis da transação,
// como valor, data, categoria e descrição.
// Além disso, ela também constrói um índice de data para facilitar a ordenação
export function buildEncryptedTransactionData(
  input: PlainTransactionInput,
  encryptionService: FinancialDataEncryptionService,
): Record<string, unknown> {
  const encryptedData = encryptSensitiveTransactionData(
    input,
    encryptionService,
  );

  return {
    encryptedData,
    dateIndex: buildDateIndex(input.date),
    type: input.type,
    userId: input.userId,
  };
}

// Responsável por construir os dados de atualização de transação criptografados a partir dos dados de entrada fornecidos e dos dados atuais da transação.
// Ela utiliza o serviço de criptografia para criptografar os campos sensíveis da transação,
// como valor, data, categoria e descrição.
// Além disso, ela também constrói um índice de data atualizado para facilitar a ordenação.
export function buildEncryptedTransactionUpdateData(
  input: Partial<Omit<PlainTransactionInput, 'userId'>>,
  current: DecryptedTransaction,
  encryptionService: FinancialDataEncryptionService,
): Record<string, unknown> {
  const merged = {
    value: input.value ?? current.value,
    date: input.date ?? current.date,
    category: input.category ?? current.category,
    description:
      input.description !== undefined ? input.description : current.description,
    type: input.type ?? current.type,
  };

  return {
    encryptedData: encryptSensitiveTransactionData(merged, encryptionService),
    dateIndex: buildDateIndex(merged.date),
    type: merged.type,
  };
}
// Monta uma transação descriptpgrafando dados sensiveis
export function decryptTransaction(
  transaction: EncryptedTransactionRecord,
  encryptionService: FinancialDataEncryptionService,
): DecryptedTransaction {
  const sensitiveData = transaction.encryptedData;

  return {
    id: transaction.id,
    value: encryptionService.decrypt<number>(sensitiveData.value),
    date: new Date(encryptionService.decrypt<string>(sensitiveData.date)),
    category: encryptionService.decrypt<string>(sensitiveData.category),
    description: encryptionService.decrypt<string | null>(
      sensitiveData.description,
    ),
    type: transaction.type,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    userId: transaction.userId,
  };
}

export function decryptTransactions(
  transactions: EncryptedTransactionRecord[],
  encryptionService: FinancialDataEncryptionService,
): DecryptedTransaction[] {
  return transactions.map((transaction) =>
    decryptTransaction(transaction, encryptionService),
  );
}

// Monta o dateIndex
export function buildDateIndex(date: Date): number {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return Number(`${year}${month}${day}`);
}

// Monta os dados criptografados
function encryptSensitiveTransactionData(
  input: Omit<PlainTransactionInput, 'userId'>,
  encryptionService: FinancialDataEncryptionService,
): Record<keyof TransactionSensitiveData, string> {
  return {
    value: encryptionService.encrypt(input.value),
    date: encryptionService.encrypt(input.date.toISOString()),
    category: encryptionService.encrypt(input.category),
    description: encryptionService.encrypt(input.description ?? null),
  };
}
