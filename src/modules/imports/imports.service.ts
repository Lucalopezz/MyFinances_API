import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import {
  buildEncryptedTransactionData,
  decryptTransaction,
} from '../transactions/transaction-encryption.mapper';
import {
  ConfirmImport,
  IMPORT_TTL_MS,
  ImportOptions,
  ImportPayload,
  ImportRow,
} from './import.dto';
import { externalKey, fileDuplicates, fingerprint } from './import-duplicates';
import {
  addImportHistory,
  evaluateImportRow,
  findImportDuplicates,
  ImportHistory,
  previewImportRows,
} from './import-preview';
import { ImportsRepository, LineResult } from './imports.repository';
import { parseStatement } from './statement-parser';

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(ImportsService.name);
  constructor(
    private readonly repository: ImportsRepository,
    private readonly transactions: TransactionsRepository,
    private readonly categories: CategoriesService,
    private readonly encryption: FinancialDataEncryptionService,
  ) {}

  onModuleInit() {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async purge() {
    try {
      await this.repository.purgeExpired();
    } catch {
      this.logger.warn(
        'Não foi possível descartar prévias expiradas. Nova tentativa em um minuto.',
      );
    }
  }

  async preview(buffer: Buffer, options: ImportOptions, userId: string) {
    const payload = parseStatement(buffer, options);
    const [resolver, history] = await Promise.all([
      this.categories.createResolver(userId),
      this.history(payload, userId),
    ]);
    const rows = previewImportRows(payload, resolver, history);
    const batch = await this.repository.create(
      userId,
      this.encryption.encrypt(payload),
      new Date(Date.now() + IMPORT_TTL_MS),
      payload.rows.length,
    );
    return { batchId: batch.id, expiresAt: batch.expiresAt, rows };
  }

  async get(id: string, userId: string) {
    const batch = await this.owned(id, userId);
    const storedResults = await this.repository.results(id, userId);
    const results: LineResult[] = Array.from(
      { length: batch.rowCount },
      (_, index) =>
        storedResults.find((row) => row.rowId === index + 1) ?? {
          rowId: index + 1,
          status: 'PENDING',
          transactionId: null,
          reason:
            !batch.encryptedData || batch.expiresAt <= new Date()
              ? 'EXPIRED_OR_CANCELLED'
              : 'NOT_PROCESSED',
        },
    );
    if (!batch.encryptedData || batch.expiresAt <= new Date())
      return {
        batchId: id,
        expiresAt: batch.expiresAt,
        expired: true,
        rows: [],
        results: results.map(this.publicResult),
        summary: this.summary(results),
      };
    const payload = this.encryption.decrypt<ImportPayload>(batch.encryptedData);
    const [resolver, history] = await Promise.all([
      this.categories.createResolver(userId),
      this.history(payload, userId),
    ]);
    return {
      batchId: id,
      expiresAt: batch.expiresAt,
      expired: false,
      rows: previewImportRows(payload, resolver, history),
      results: results.map(this.publicResult),
      summary: this.summary(results),
    };
  }

  async cancel(id: string, userId: string) {
    await this.owned(id, userId);
    await this.repository.cancel(id, userId);
    return {
      message: 'Prévia descartada. Transações já importadas são preservadas.',
    };
  }

  async confirm(id: string, dto: ConfirmImport, userId: string) {
    const batch = await this.owned(id, userId);
    if (!batch.encryptedData || batch.expiresAt <= new Date())
      throw new GoneException('Prévia expirada ou cancelada.');
    const payload = this.encryption.decrypt<ImportPayload>(batch.encryptedData);
    if (
      dto.rows.some(
        (row) => !payload.rows.some((stored) => stored.rowId === row.rowId),
      )
    )
      throw new BadRequestException('Linha inexistente neste lote.');
    const choices = new Map(dto.rows.map((row) => [row.rowId, row]));
    const previous = new Map(
      (await this.repository.results(id, userId)).map((row) => [
        row.rowId,
        row,
      ]),
    );
    const [resolver, history] = await Promise.all([
      this.categories.createResolver(userId),
      this.history(payload, userId),
    ]);
    const file = fileDuplicates(payload);
    const results: LineResult[] = [];
    for (const row of payload.rows) {
      const existing = previous.get(row.rowId);
      if (existing?.status === 'IMPORTED') {
        results.push(this.publicResult(existing));
        continue;
      }
      try {
        const choice = choices.get(row.rowId);
        let result: LineResult = {
          rowId: row.rowId,
          status: 'IGNORED',
          reason: 'NOT_SELECTED',
          transactionId: null,
        };
        let transaction: Record<string, unknown> | undefined;
        if (choice?.selected) {
          const evaluated = evaluateImportRow(row, resolver, choice.category);
          const duplicates = findImportDuplicates(
            row,
            payload.source,
            history,
            file,
          );
          if (evaluated.errors.length)
            result = {
              ...result,
              status: 'REJECTED',
              reason: evaluated.categoryError
                ? 'INVALID_CATEGORY'
                : 'INVALID_ROW',
            };
          else if (duplicates.length && !choice.allowDuplicate)
            result = { ...result, reason: 'DUPLICATE_REQUIRES_APPROVAL' };
          else {
            // Resolve against the current catalog again at the point of writing.
            try {
              await this.categories.resolveReference(
                evaluated.category,
                userId,
                row.type,
              );
            } catch (error) {
              if (!(error instanceof BadRequestException)) throw error;
              results.push(
                this.publicResult(
                  await this.repository.saveResult(id, userId, {
                    ...result,
                    status: 'REJECTED',
                    reason: 'INVALID_CATEGORY',
                  }),
                ),
              );
              continue;
            }
            transaction = {
              ...buildEncryptedTransactionData(
                {
                  userId,
                  date: new Date(`${row.date}T00:00:00.000Z`),
                  value: row.value,
                  description: row.description,
                  type: row.type,
                  category: evaluated.category,
                },
                this.encryption,
              ),
              ...(row.externalId
                ? {
                    encryptedImportIdentity: this.encryption.encrypt({
                      source: payload.source,
                      externalId: row.externalId,
                    }),
                  }
                : {}),
            };
            result = { ...result, status: 'IMPORTED', reason: null };
          }
        }
        const saved = await this.repository.saveResult(
          id,
          userId,
          result,
          transaction,
        );
        results.push(this.publicResult(saved));
        if (saved.status === 'IMPORTED')
          addImportHistory(history, row, payload.source, saved.transactionId);
      } catch (error) {
        // No payload or database error is exposed; the receipt is authoritative on retry.
        results.push({
          rowId: row.rowId,
          status: 'PENDING',
          reason:
            error instanceof GoneException
              ? 'EXPIRED_OR_CANCELLED'
              : 'RETRY_REQUIRED',
          transactionId: null,
        });
      }
    }
    return {
      batchId: id,
      results,
      summary: this.summary(results),
      recalculationPending: false,
    };
  }

  private publicResult(row: LineResult): LineResult {
    return {
      rowId: row.rowId,
      status: row.status,
      reason: row.reason,
      transactionId: row.transactionId,
    };
  }
  private summary(results: LineResult[]) {
    return {
      imported: results.filter((r) => r.status === 'IMPORTED').length,
      ignored: results.filter((r) => r.status === 'IGNORED').length,
      rejected: results.filter((r) => r.status === 'REJECTED').length,
      pending: results.filter((r) => r.status === 'PENDING').length,
    };
  }
  private async owned(id: string, userId: string) {
    if (!/^[a-f\d]{24}$/.test(id))
      throw new NotFoundException('Lote não encontrado.');
    const batch = await this.repository.find(id, userId);
    if (!batch) throw new NotFoundException('Lote não encontrado.');
    return batch;
  }
  private async history(
    payload: ImportPayload,
    userId: string,
  ): Promise<ImportHistory> {
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
      const records = await this.transactions.findSearchBatch(
        { userId, position },
        200,
      );
      for (const record of records) {
        const item = decryptTransaction(record, this.encryption);
        const identity = record.encryptedImportIdentity
          ? this.encryption.decrypt<{ source: string; externalId: string }>(
              record.encryptedImportIdentity,
            )
          : null;
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
