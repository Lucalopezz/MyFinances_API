import { Injectable } from '@nestjs/common';
import { ImportPayload, ImportRow } from '../dto/import.dto';
import { TransactionQueriesService } from '../../services/transaction-queries.service';
import { ImportHistory, addImportHistory } from './import-preview';
import { externalKey, fingerprint } from '../domain/import-duplicates';

/** Monta somente os candidatos relevantes à deduplicação e mantém a leitura em lotes. */
@Injectable()
export class ImportHistoryService {
  constructor(private readonly transactions: TransactionQueriesService) {}
  async load(payload: ImportPayload, userId: string): Promise<ImportHistory> {
    const result: ImportHistory = {
      fingerprints: new Map(),
      externalIds: new Map(),
    };
    const wantedFingerprints = new Set(payload.rows.map(fingerprint));
    const wantedExternal = new Set(
      payload.rows.map((row) => externalKey(payload.source, row.externalId)),
    );
    let position: { id: string; dateIndex: number } | undefined;
    while (true) {
      const records = await this.transactions.findImportBatch(
        { userId, position },
        200,
      );
      for (const record of records) {
        const item = record;
        const identity = record.importIdentity;
        const row: ImportRow = {
          rowId: 0,
          date: item.date.toISOString().slice(0, 10),
          description: item.description ?? '',
          type: item.type,
          value: item.value,
          externalId: identity?.externalId,
          errors: [],
        };
        if (
          wantedFingerprints.has(fingerprint(row)) ||
          (identity &&
            wantedExternal.has(
              externalKey(identity.source, identity.externalId),
            ))
        )
          addImportHistory(result, row, identity?.source ?? '', record.id);
      }
      if (records.length < 200) break;
      const last = records[records.length - 1];
      position = { id: last.id, dateIndex: last.dateIndex };
    }
    return result;
  }
}
