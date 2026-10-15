/** Dados normalizados do extrato, independentes do contrato HTTP e do banco. */
export type ImportRow = {
  rowId: number;
  date?: string;
  description?: string;
  value?: number;
  type?: 'INCOME' | 'EXPENSE';
  category?: string;
  externalId?: string;
  errors: string[];
};
export type ImportPayload = { source: string; rows: ImportRow[] };
export type DuplicateCandidate = {
  kind: 'FILE' | 'HISTORY';
  reason: 'EXTERNAL_ID' | 'FINGERPRINT';
  rowId?: number;
  transactionId?: string;
};

export type ImportOptions = {
  format: 'CSV' | 'OFX';
  encoding: 'utf-8' | 'windows-1252';
  source: string;
  csv?: {
    delimiter: ',' | ';' | '\t';
    dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
    decimalSeparator: ',' | '.';
    header: boolean;
    columns: {
      date: number;
      description: number;
      value?: number;
      income?: number;
      expense?: number;
      category?: number;
      externalId?: number;
      type?: number;
    };
  };
};
