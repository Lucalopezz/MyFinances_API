export type TransactionSensitiveData = {
  value: number;
  date: string;
  category: string;
  description?: string | null;
};

export type EncryptedTransactionRecord = {
  id: string;
  encryptedImportIdentity?: string | null;
  encryptedData: Record<keyof TransactionSensitiveData, string>;
  dateIndex: number;
  type: 'INCOME' | 'EXPENSE';
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
  type: 'INCOME' | 'EXPENSE';
  createdAt: Date;
  updatedAt: Date;
  userId: string;
};

export type PlainTransactionInput = {
  value: number;
  date: Date;
  category: string;
  description?: string | null;
  type: 'INCOME' | 'EXPENSE';
  userId: string;
};
