import {
  ConfirmImportSchema,
  IMPORT_MAX_BYTES,
  ImportOptions,
  ImportOptionsSchema,
} from './import.dto';
import { parseMoney, parseStatement } from './statement-parser';

export const csvOptions: ImportOptions = {
  format: 'CSV',
  encoding: 'utf-8',
  source: 'bank:checking',
  csv: {
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    header: true,
    columns: { date: 0, description: 1, value: 2 },
  },
};
export function ofx(xml = true, currency = 'BRL', transactions?: string) {
  const field = (name: string, value: string) =>
    `<${name}>${value}${xml ? `</${name}>` : '\n'}`;
  return `${xml ? '<?xml version="1.0" encoding="UTF-8"?>' : 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:USASCII\nCHARSET:1252\n\n'}<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>${field('CURDEF', currency)}<BANKACCTFROM>${field('BANKID', '001')}${field('ACCTID', '123')}${field('ACCTTYPE', 'CHECKING')}</BANKACCTFROM><BANKTRANLIST>${transactions ?? `<STMTTRN>${field('TRNTYPE', 'DEBIT')}${field('DTPOSTED', '20260928120000[-3:BRT]')}${field('TRNAMT', '-20.10')}${field('FITID', 'abc-1')}${field('NAME', 'Café &amp; pão')}${field('MEMO', 'Compra')}</STMTTRN>`}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

describe('statement parser', () => {
  const parse = (text: string, options = csvOptions) =>
    parseStatement(Buffer.from(text), options);
  it('reads BOM, accents, quoted delimiters/newlines, escaped quotes and negative Brazilian money', () => {
    const result = parse(
      '\uFEFFdata;descrição;valor\r\n28/09/2026;"Café; ""bom""\nCompra";-1.234,56\r\n29/09/2026;Salário;5000,00',
    );
    expect(result.rows).toMatchObject([
      {
        rowId: 1,
        date: '2026-09-28',
        description: 'Café; "bom"\nCompra',
        value: 1234.56,
        type: 'EXPENSE',
        errors: [],
      },
      { rowId: 2, value: 5000, type: 'INCOME', errors: [] },
    ]);
  });
  it('reads comma separated US decimals and explicit type/category/external ID', () => {
    const options: ImportOptions = {
      ...csvOptions,
      csv: {
        delimiter: ',',
        header: true,
        dateFormat: 'MM/DD/YYYY',
        decimalSeparator: '.',
        columns: {
          date: 0,
          description: 1,
          value: 2,
          type: 3,
          category: 4,
          externalId: 5,
        },
      },
    };
    expect(
      parse(
        'date,description,value,type,category,id\n09/28/2026,"Store, US","1,234.56",EXPENSE,SHOPPING,123',
        options,
      ).rows[0],
    ).toMatchObject({
      value: 1234.56,
      type: 'EXPENSE',
      category: 'SHOPPING',
      externalId: '123',
      errors: [],
    });
  });
  it('handles separate credit/debit columns and rejects ambiguous entries', () => {
    const options: ImportOptions = {
      ...csvOptions,
      csv: {
        ...csvOptions.csv,
        columns: { date: 0, description: 1, income: 2, expense: 3 },
      },
    };
    const rows = parse(
      'd;desc;in;out\n28/09/2026;A;100;\n28/09/2026;B;;25\n28/09/2026;C;10;20\n28/09/2026;D;0;-2',
      options,
    ).rows;
    expect(rows[0]).toMatchObject({ type: 'INCOME', value: 100, errors: [] });
    expect(rows[1]).toMatchObject({ type: 'EXPENSE', value: 25, errors: [] });
    expect(rows[2].errors).not.toHaveLength(0);
    expect(rows[3].errors).not.toHaveLength(0);
  });
  it.each([
    '31/02/2026;A;10',
    '29/02/2025;A;10',
    '01/13/2026;A;10',
    '28/09/2026;;10',
    '28/09/2026;A;0',
    '28/09/2026;A;1,234',
    '28/09/2026;A;NaN',
    '28/09/2026;A;1e2',
    '28/09/2026;A;1;extra',
  ])('retains row error for %s', (row) => {
    const result = parse('d;desc;value\n' + row + '\n28/09/2026;Valid;1');
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[1].errors).toEqual([]);
  });
  it('rejects invalid encoding, empty file, malformed quoting, wrong mapping and excessive size/count', () => {
    expect(() => parseStatement(Buffer.from([0xc3, 0x28]), csvOptions)).toThrow(
      'Codificação',
    );
    expect(() => parse('')).toThrow('não vazio');
    expect(() => parse('d;desc;value\n28/09/2026;"abc;10')).toThrow('aspas');
    expect(() => parse('d;desc;value\n28/09/2026;"abc"x;10')).toThrow('aspas');
    expect(() => parse('one\nA')).toThrow('Mapeamento');
    expect(() => parse('x'.repeat(IMPORT_MAX_BYTES + 1))).toThrow('2 MiB');
    expect(() =>
      parse('d;desc;value\n' + '28/09/2026;A;10\n'.repeat(1001)),
    ).toThrow('1000');
    expect(
      parse('d;desc;value\n' + '28/09/2026;A;10\n'.repeat(1000)).rows,
    ).toHaveLength(1000);
  });
  it('decodes Windows-1252 only when explicitly selected', () => {
    const buffer = Buffer.from('d;desc;value\n28/09/2026;Café;10', 'latin1');
    expect(
      parseStatement(buffer, { ...csvOptions, encoding: 'windows-1252' })
        .rows[0].description,
    ).toBe('Café');
    expect(() => parseStatement(buffer, csvOptions)).toThrow('Codificação');
  });
  it.each([true, false])('extracts OFX fields from XML=%s', (xml) => {
    const result = parse(ofx(xml), {
      format: 'OFX',
      source: 'bank',
      encoding: 'utf-8',
    });
    expect(result.rows[0]).toMatchObject({
      date: '2026-09-28',
      description: 'Café & pão - Compra',
      value: 20.1,
      type: 'EXPENSE',
      externalId: 'abc-1',
      errors: [],
    });
    expect(JSON.parse(result.source)).toEqual([
      'bank',
      '001',
      '',
      '123',
      'CHECKING',
    ]);
  });
  it('supports credit-card OFX and rejects unsupported currency, DTD, multiple accounts and malformed XML', () => {
    const options: ImportOptions = {
      format: 'OFX',
      source: 'bank',
      encoding: 'utf-8',
    };
    expect(
      parse(
        ofx()
          .replaceAll('STMTRS', 'CCSTMTRS')
          .replaceAll('BANKACCTFROM', 'CCACCTFROM'),
        options,
      ).rows,
    ).toHaveLength(1);
    expect(() => parse(ofx(true, 'USD'), options)).toThrow('Moeda');
    expect(
      parse(
        ofx().replace(
          '</STMTTRN>',
          '<CURRENCY><CURSYM>USD</CURSYM></CURRENCY></STMTTRN>',
        ),
        options,
      ).rows[0].errors,
    ).toEqual(['Moeda da movimentação não suportada. Apenas BRL é aceita.']);
    expect(() => parse('<!DOCTYPE OFX>' + ofx(), options)).toThrow('DTD');
    expect(() =>
      parse(ofx().replace('</OFX>', '<STMTRS></STMTRS></OFX>'), options),
    ).toThrow('único');
    expect(() => parse(ofx().replace('</TRNAMT>', ''), options)).toThrow(
      'texto fora',
    );
    expect(() => parse(ofx().replace('</OFX>', ''), options)).toThrow(
      'incompleto',
    );
  });
  it.each([
    '1,234.56',
    '1.2.3',
    '--1',
    'Infinity',
    '1e10',
    '1,234',
    '10000000000',
  ])('rejects invalid BRL number %s', (raw) => {
    expect(() => parseMoney(raw, ',')).toThrow();
  });
  it('validates distinct columns, required mapping and confirmation immutability', () => {
    expect(ImportOptionsSchema.safeParse(csvOptions).success).toBe(true);
    expect(
      ImportOptionsSchema.safeParse({ ...csvOptions, csv: undefined }).success,
    ).toBe(false);
    expect(
      ImportOptionsSchema.safeParse({
        ...csvOptions,
        csv: {
          ...csvOptions.csv,
          columns: { date: 0, description: 0, value: 2 },
        },
      }).success,
    ).toBe(false);
    expect(
      ConfirmImportSchema.safeParse({
        rows: [{ rowId: 1, selected: true, value: 100 }],
      }).success,
    ).toBe(false);
    expect(
      ConfirmImportSchema.safeParse({
        rows: [
          { rowId: 1, selected: true },
          { rowId: 1, selected: false },
        ],
      }).success,
    ).toBe(false);
  });
});
