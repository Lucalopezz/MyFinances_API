import { DecryptedTransaction } from '../../mappers/transaction-encryption.mapper';

// Cada formato tem seu próprio documento, mas o processamento em lotes usa
// apenas estas operações. A confirmação da gravação continua no processador.
export type TransactionExportWriter = {
  addTransaction(transaction: DecryptedTransaction): void | Promise<void>;
  finalize(): void | Promise<void>;
  abort(): void;
};
