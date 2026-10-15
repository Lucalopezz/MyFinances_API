import { ImportOptions as ParserOptions } from '../types/import.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { CategoriesService } from '../../../categories/categories.service';
import {
  ConfirmImport,
  ImportOptions,
  ImportPayload,
  IMPORT_TTL_MS,
} from '../dto/import.dto';
import { previewImportRows } from './import-preview';
import {
  ImportsRepository,
  LineResult,
} from '../repositories/imports.repository';
import {
  parseStatement,
  StatementParseError,
} from '../parsers/statement-parser';
import { ImportHistoryService } from './import-history.service';
import { ImportConfirmationService } from './import-confirmation.service';
import {
  publicImportResult,
  summarizeImportResults,
} from '../mappers/import-result.mapper';

/** Coordena a prévia e a consulta dos lotes; confirmação e expiração têm serviços próprios. */
@Injectable()
export class ImportsService {
  constructor(
    private readonly repository: ImportsRepository,
    private readonly categories: CategoriesService,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly history: ImportHistoryService,
    private readonly confirmation: ImportConfirmationService,
  ) {}
  async preview(buffer: Buffer, options: ImportOptions, userId: string) {
    let payload: ImportPayload;
    try {
      payload = parseStatement(buffer, options as ParserOptions);
    } catch (error) {
      if (error instanceof StatementParseError)
        throw new BadRequestException(error.message);
      throw error;
    }
    const [resolver, history] = await Promise.all([
      this.categories.createResolver(userId),
      this.history.load(payload, userId),
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
        results: results.map(publicImportResult),
        summary: summarizeImportResults(results),
      };
    const payload = this.encryption.decrypt<ImportPayload>(batch.encryptedData);
    const [resolver, history] = await Promise.all([
      this.categories.createResolver(userId),
      this.history.load(payload, userId),
    ]);
    return {
      batchId: id,
      expiresAt: batch.expiresAt,
      expired: false,
      rows: previewImportRows(payload, resolver, history),
      results: results.map(publicImportResult),
      summary: summarizeImportResults(results),
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
    return this.confirmation.confirm(await this.owned(id, userId), dto, userId);
  }

  private async owned(id: string, userId: string) {
    if (!/^[a-f\d]{24}$/.test(id))
      throw new NotFoundException('Lote não encontrado.');
    const batch = await this.repository.find(id, userId);
    if (!batch) throw new NotFoundException('Lote não encontrado.');
    return batch;
  }
}
