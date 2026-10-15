import { Injectable } from '@nestjs/common';
import { WishlistItem, WishlistMovement } from '@prisma/client';
import { dayKey } from 'src/common/date/civil-date';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import {
  buildEncryptedTransactionData,
  decryptTransaction,
  decryptTransactions,
  EncryptedTransactionRecord,
} from '../../transactions/mappers/transaction-encryption.mapper';
import { WishlistMovementKind } from '../types/wishlist.types';

/** Converte os registros e protege os campos financeiros, sem executar cálculos. */
@Injectable()
export class WishlistMapper {
  constructor(private readonly encryption: FinancialDataEncryptionService) {}

  movementData(value: number, date: string, note?: string | null) {
    return {
      value: this.encryption.encrypt(value),
      date: this.encryption.encrypt(date),
      note: this.encryption.encrypt(note ?? null),
    };
  }

  movement(movement: WishlistMovement) {
    const data = movement.encryptedData as {
      value: string;
      date: string;
      note: string;
    };
    return {
      id: movement.id,
      kind: movement.kind as WishlistMovementKind,
      value: this.encryption.decrypt<number>(data.value),
      date: this.encryption.decrypt<string>(data.date),
      note: this.encryption.decrypt<string | null>(data.note),
      createdAt: movement.createdAt,
    };
  }

  item(item: WishlistItem) {
    return {
      id: item.id,
      name: item.name,
      desiredValue: item.desiredValue,
      targetDate: item.targetDate ? dayKey(item.targetDate) : null,
      legacySavedAmount: item.savedAmount,
      reservationMigrationState: item.reservationMigrationState ?? 'PENDING',
      status: item.status ?? 'ACTIVE',
      completedAt: item.completedAt,
      purchaseTransactionId: item.purchaseTransactionId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  transaction(record: unknown) {
    return decryptTransaction(
      record as EncryptedTransactionRecord,
      this.encryption,
    );
  }

  transactions(records: unknown[]) {
    return decryptTransactions(
      records as EncryptedTransactionRecord[],
      this.encryption,
    );
  }

  purchaseData(data: Parameters<typeof buildEncryptedTransactionData>[0]) {
    return buildEncryptedTransactionData(data, this.encryption);
  }
}
