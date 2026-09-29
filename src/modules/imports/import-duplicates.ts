import { normalizeDescription } from '../categories/category.dto';
import { DuplicateCandidate, ImportPayload, ImportRow } from './import.dto';

export function fingerprint(
  row: Pick<ImportRow, 'date' | 'type' | 'value' | 'description'>,
): string | null {
  if (!row.date || !row.type || !row.value || !row.description) return null;
  return JSON.stringify([
    row.date,
    row.type,
    Math.round(row.value * 100),
    normalizeDescription(row.description).replace(/\s+/g, ' '),
  ]);
}
export function externalKey(source: string, id?: string): string | null {
  return id ? JSON.stringify([source, id]) : null;
}

export function fileDuplicates(
  payload: ImportPayload,
): Map<number, DuplicateCandidate[]> {
  const result = new Map<number, DuplicateCandidate[]>();
  const byFingerprint = new Map<string, number[]>();
  const byExternalId = new Map<string, number[]>();
  for (const row of payload.rows) {
    for (const [map, key] of [
      [byFingerprint, fingerprint(row)],
      [byExternalId, externalKey(payload.source, row.externalId)],
    ] as const) {
      if (key) map.set(key, [...(map.get(key) ?? []), row.rowId]);
    }
  }
  for (const row of payload.rows) {
    const fp = fingerprint(row),
      ext = externalKey(payload.source, row.externalId);
    const external = byExternalId.get(ext) ?? [];
    result.set(
      row.rowId,
      [...new Set([...external, ...(byFingerprint.get(fp) ?? [])])]
        .filter((id) => id !== row.rowId)
        .slice(0, 20)
        .map((id) => ({
          kind: 'FILE',
          rowId: id,
          reason: external.includes(id) ? 'EXTERNAL_ID' : 'FINGERPRINT',
        })),
    );
  }
  return result;
}
