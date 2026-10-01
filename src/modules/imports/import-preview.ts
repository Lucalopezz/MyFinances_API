import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { DuplicateCandidate, ImportPayload, ImportRow } from './import.dto';
import { externalKey, fileDuplicates, fingerprint } from './import-duplicates';
import { parseCalendarDate } from './statement-parser';

type Resolver = Awaited<ReturnType<CategoriesService['createResolver']>>;
export type ImportHistory = {
  fingerprints: Map<string, string[]>;
  externalIds: Map<string, string[]>;
};

export function evaluateImportRow(
  row: ImportRow,
  resolver: Resolver,
  category?: string,
) {
  const errors = [...row.errors];
  if (errors.length)
    return {
      errors,
      category: null,
      categoryError: false,
      categorySource: null,
      ruleId: null,
    };
  try {
    parseCalendarDate(row.date, 'YYYY-MM-DD');
    if (
      !row.description?.trim() ||
      row.description.length > 2000 ||
      !Number.isFinite(row.value) ||
      row.value <= 0 ||
      row.value > 9999999999.99 ||
      !['INCOME', 'EXPENSE'].includes(row.type)
    )
      throw new Error();
  } catch {
    return {
      errors: ['Dados da linha inválidos.'],
      category: null,
      categoryError: false,
      categorySource: null,
      ruleId: null,
    };
  }
  try {
    const resolved = resolver({
      description: row.description,
      type: row.type,
      category: category ?? row.category,
    });
    return {
      errors,
      category:
        resolved.category ?? (row.type === 'INCOME' ? 'OTHER_INCOME' : 'OTHER'),
      categoryError: false,
      categorySource: resolved.source ?? 'default',
      ruleId: resolved.ruleId,
    };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return {
      errors: ['Categoria inválida, arquivada ou incompatível.'],
      category: category ?? row.category ?? null,
      categoryError: true,
      categorySource: null,
      ruleId: null,
    };
  }
}

export function findImportDuplicates(
  row: ImportRow,
  source: string,
  history: ImportHistory,
  file: Map<number, DuplicateCandidate[]>,
): DuplicateCandidate[] {
  const external =
    history.externalIds.get(externalKey(source, row.externalId)) ?? [];
  const fingerprints = history.fingerprints.get(fingerprint(row)) ?? [];
  const ids = [...new Set([...external, ...fingerprints])];
  return [
    ...(file.get(row.rowId) ?? []),
    ...ids.slice(0, 20).map(
      (transactionId): DuplicateCandidate => ({
        kind: 'HISTORY',
        transactionId,
        reason: external.includes(transactionId)
          ? 'EXTERNAL_ID'
          : 'FINGERPRINT',
      }),
    ),
  ];
}

export function previewImportRows(
  payload: ImportPayload,
  resolver: Resolver,
  history: ImportHistory,
) {
  const file = fileDuplicates(payload);
  return payload.rows.map((row) => {
    const evaluated = evaluateImportRow(row, resolver);
    const duplicates = findImportDuplicates(row, payload.source, history, file);
    return {
      ...row,
      category: evaluated.category,
      categorySource: evaluated.categorySource,
      ruleId: evaluated.ruleId,
      errors: evaluated.errors,
      categoryError: evaluated.categoryError,
      duplicates,
      selected: !evaluated.errors.length && !duplicates.length,
    };
  });
}

export function addImportHistory(
  history: ImportHistory,
  row: ImportRow,
  source: string,
  id: string,
) {
  for (const [map, key] of [
    [history.fingerprints, fingerprint(row)],
    [history.externalIds, externalKey(source, row.externalId)],
  ] as const) {
    if (!key) continue;
    const ids = map.get(key) ?? [];
    if (ids.length < 20 && !ids.includes(id)) ids.push(id);
    map.set(key, ids);
  }
}
