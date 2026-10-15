import { LineResult } from '../repositories/imports.repository';

export function publicImportResult(row: LineResult): LineResult {
  return {
    rowId: row.rowId,
    status: row.status,
    reason: row.reason,
    transactionId: row.transactionId,
  };
}
export function summarizeImportResults(results: LineResult[]) {
  return {
    imported: results.filter((r) => r.status === 'IMPORTED').length,
    ignored: results.filter((r) => r.status === 'IGNORED').length,
    rejected: results.filter((r) => r.status === 'REJECTED').length,
    pending: results.filter((r) => r.status === 'PENDING').length,
  };
}
