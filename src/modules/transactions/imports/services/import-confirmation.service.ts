import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { CategoriesService } from '../../../categories/categories.service';
import { buildEncryptedTransactionData } from '../../mappers/transaction-encryption.mapper';
import { ConfirmImport, ImportPayload } from '../dto/import.dto';
import { fileDuplicates } from '../domain/import-duplicates';
import {
  addImportHistory,
  evaluateImportRow,
  findImportDuplicates,
} from './import-preview';
import {
  ImportsRepository,
  LineResult,
} from '../repositories/imports.repository';
import {
  publicImportResult,
  summarizeImportResults,
} from '../mappers/import-result.mapper';
import { ImportHistoryService } from './import-history.service';

/** Confirma cada linha com recibo atômico; uma nova tentativa reaproveita os recibos anteriores. */
@Injectable()
export class ImportConfirmationService {
  constructor(
    private readonly repository: ImportsRepository,
    private readonly categories: CategoriesService,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly history: ImportHistoryService,
  ) {}
  /** Processa decisões da revisão; falhas em uma linha preservam as já confirmadas no lote. */
  async confirm(
    batch: Awaited<ReturnType<ImportsRepository['find']>>,
    dto: ConfirmImport,
    userId: string,
  ) {
    const id = batch.id;
    if (!batch.encryptedData || batch.expiresAt <= new Date())
      throw new GoneException('Prévia expirada ou cancelada.');
    // Datas, valores e descrições vêm da prévia armazenada. O cliente escolhe as
    // linhas, a categoria e a aprovação de duplicatas, sem reescrever o extrato original.
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
      this.history.load(payload, userId),
    ]);
    const file = fileDuplicates(payload);
    const results: LineResult[] = [];
    for (const row of payload.rows) {
      const existing = previous.get(row.rowId);
      if (existing?.status === 'IMPORTED') {
        // O recibo definitivo prevalece até se a transação já tiver sido excluída.
        // Repetir a confirmação não deve recriar um lançamento que o usuário removeu.
        results.push(publicImportResult(existing));
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
            // Resolve a categoria novamente pelo catálogo atual no momento da gravação.
            try {
              await this.categories.resolveReference(
                evaluated.category,
                userId,
                row.type,
              );
            } catch (error) {
              if (!(error instanceof BadRequestException)) throw error;
              results.push(
                publicImportResult(
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
        // saveResult confirma lançamento e recibo juntos por usuário/lote/linha.
        // A atomicidade é por linha: o lote pode terminar com importadas e pendentes.
        const saved = await this.repository.saveResult(
          id,
          userId,
          result,
          transaction,
        );
        results.push(publicImportResult(saved));
        // As próximas linhas também precisam enxergar o que acabou de ser importado,
        // pois o histórico inicial foi carregado antes do processamento deste lote.
        if (saved.status === 'IMPORTED')
          addImportHistory(history, row, payload.source, saved.transactionId);
      } catch (error) {
        // Não expõe dados enviados nem erros do banco; em uma nova tentativa, o comprovante é a referência.
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
      summary: summarizeImportResults(results),
      recalculationPending: false,
    };
  }
}
