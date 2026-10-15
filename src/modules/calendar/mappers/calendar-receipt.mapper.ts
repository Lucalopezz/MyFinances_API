import { Injectable } from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import {
  CalendarEvent,
  CalendarReceiptSnapshot,
} from '../types/calendar.types';

/** Converte recibos persistidos sem recalcular seus snapshots financeiros. */
@Injectable()
export class CalendarReceiptMapper {
  constructor(private readonly encryption: FinancialDataEncryptionService) {}

  snapshot(row: {
    sourceId: string;
    periodKey: string;
    encryptedData: string;
  }): CalendarReceiptSnapshot {
    return {
      sourceId: row.sourceId,
      periodKey: row.periodKey,
      event: this.encryption.decrypt<CalendarEvent>(row.encryptedData),
    };
  }
}
