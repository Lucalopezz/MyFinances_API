import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { buildEncryptedTransactionData } from '../../transactions/mappers/transaction-encryption.mapper';
import {
  IncomeConfirmation,
  IncomeOccurrence,
  IncomeRevision,
} from '../types/recurring-income.types';

/** A criptografia dos agendamentos e recibos fica no adaptador, fora das regras. */
@Injectable()
export class RecurringIncomeEncryptionMapper {
  constructor(private readonly encryption: FinancialDataEncryptionService) {}

  revisions(encrypted: string): IncomeRevision[] {
    return this.encryption.decrypt<IncomeRevision[]>(encrypted);
  }

  encryptRevisions(revisions: IncomeRevision[]): string {
    return this.encryption.encrypt(revisions);
  }

  receipt(encrypted: string): IncomeOccurrence {
    return this.encryption.decrypt<IncomeOccurrence>(encrypted);
  }

  /** O meio-dia UTC preserva a data civil enviada pelo usuário. */
  transaction(
    userId: string,
    event: IncomeOccurrence,
    input: IncomeConfirmation,
  ) {
    return buildEncryptedTransactionData(
      {
        userId,
        value: input.amount,
        date: new Date(`${input.date}T12:00:00Z`),
        category: event.category,
        description: event.description,
        type: 'INCOME',
      },
      this.encryption,
    ) as Prisma.TransactionUncheckedCreateInput;
  }

  settledSnapshot(
    event: IncomeOccurrence,
    input: IncomeConfirmation,
    transactionId: string,
  ) {
    return this.encryption.encrypt({
      ...event,
      status: 'SETTLED',
      actualDate: input.date,
      actualAmount: input.amount,
      transactionId,
    } satisfies IncomeOccurrence);
  }
}
