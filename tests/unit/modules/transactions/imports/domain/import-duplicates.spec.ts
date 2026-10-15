import {
  externalKey,
  fileDuplicates,
  fingerprint,
} from 'src/modules/transactions/imports/domain/import-duplicates';
import { ImportRow } from 'src/modules/transactions/imports/types/import.types';

describe('Duplicatas de extratos', () => {
  const row: ImportRow = {
    rowId: 1,
    date: '2026-10-15',
    description: 'Café  da manhã',
    value: 10.1,
    type: 'EXPENSE',
    errors: [],
  };

  it('compara centavos e descrição normalizada sem confundir tipo ou data', () => {
    expect(
      fingerprint({ ...row, description: ' CAFE da MANHA ', value: 10.1 }),
    ).toBe(fingerprint(row));
    expect(fingerprint({ ...row, type: 'INCOME' })).not.toBe(fingerprint(row));
    expect(fingerprint({ ...row, date: '2026-10-16' })).not.toBe(
      fingerprint(row),
    );
  });

  it('não gera impressão digital para linhas incompletas', () => {
    expect(fingerprint({ ...row, date: undefined })).toBeNull();
    expect(fingerprint({ ...row, value: undefined })).toBeNull();
    expect(externalKey('Banco')).toBeNull();
  });

  it('isola identificadores externos pela origem do extrato', () => {
    expect(externalKey('Banco A', '123')).not.toBe(
      externalKey('Banco B', '123'),
    );
  });

  it('retorna a outra linha uma única vez, priorizando o identificador externo', () => {
    const result = fileDuplicates({
      source: 'Banco',
      rows: [
        { ...row, externalId: '123' },
        { ...row, rowId: 2, externalId: '123' },
      ],
    });
    expect(result.get(1)).toEqual([
      { kind: 'FILE', rowId: 2, reason: 'EXTERNAL_ID' },
    ]);
    expect(result.get(2)).toEqual([
      { kind: 'FILE', rowId: 1, reason: 'EXTERNAL_ID' },
    ]);
  });

  it('encontra duplicatas por conteúdo mesmo sem identificador externo', () => {
    expect(
      fileDuplicates({
        source: 'Banco',
        rows: [row, { ...row, rowId: 2 }],
      }).get(1),
    ).toEqual([{ kind: 'FILE', rowId: 2, reason: 'FINGERPRINT' }]);
  });

  it('limita candidatos sem incluir a própria linha', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      ...row,
      rowId: index + 1,
    }));
    const candidates = fileDuplicates({ source: 'Banco', rows }).get(1)!;
    expect(candidates).toHaveLength(20);
    expect(candidates.some((candidate) => candidate.rowId === 1)).toBe(false);
  });
});
