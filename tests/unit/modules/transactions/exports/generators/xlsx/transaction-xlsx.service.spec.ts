import { Workbook, ValueType } from 'exceljs';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { finished } from 'stream/promises';
import { DecryptedTransaction } from 'src/modules/transactions/mappers/transaction-encryption.mapper';
import { TransactionXlsxService } from 'src/modules/transactions/exports/generators/xlsx/transaction-xlsx.service';

const transaction = (
  overrides: Partial<DecryptedTransaction> = {},
): DecryptedTransaction => ({
  id: '64f000000000000000000010',
  userId: '64f000000000000000000001',
  type: 'EXPENSE',
  category: 'FOOD',
  description: 'Café, mercado\nCompra com acentuação',
  value: 12.5,
  date: new Date('2026-07-06T00:00:00.000Z'),
  createdAt: new Date('2026-07-06T00:00:00.000Z'),
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
  ...overrides,
});

describe('TransactionXlsxService', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'myfinances-xlsx-test-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes native dates/numbers, localized categories and text without formulas', async () => {
    const service = new TransactionXlsxService();
    const filePath = join(directory, 'transacoes.xlsx');
    const output = createWriteStream(filePath);
    const done = finished(output);
    const customId = '64f000000000000000000070';
    const document = service.createDocument(output, [
      { id: customId, name: 'Café especial' },
    ]);
    service.addTransaction(document, transaction());
    // Nomes e descrições que se parecem com fórmulas precisam permanecer texto
    // literal; valores numéricos e datas devem continuar calculáveis no Excel.
    service.addTransaction(
      document,
      transaction({
        description: '=SUM(1,2)',
        type: 'INCOME',
        category: customId,
        value: -0.1,
      }),
    );
    service.addTransaction(
      document,
      transaction({ category: '64f000000000000000000099' }),
    );
    await service.finalizeDocument(document);
    await done;
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Transações');

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Data',
      'Descrição',
      'Categoria',
      'Tipo',
      'Valor',
    ]);
    expect(sheet.getCell('A2').type).toBe(ValueType.Date);
    expect(sheet.getCell('A2').value).toEqual(transaction().date);
    expect(sheet.getCell('A2').numFmt).toBe('dd/mm/yyyy');
    expect(sheet.getCell('B2').value).toBe(transaction().description);
    expect(sheet.getCell('C2').value).toBe('Alimentação');
    expect(sheet.getCell('C3').value).toBe('Café especial');
    expect(sheet.getCell('C4').value).toBe('Categoria indisponível');
    expect(sheet.getCell('D3').value).toBe('Receita');
    expect(sheet.getCell('B3').type).toBe(ValueType.String);
    expect(sheet.getCell('B3').value).toBe('=SUM(1,2)');
    expect(sheet.getCell('E2').type).toBe(ValueType.Number);
    expect(sheet.getCell('E2').value).toBe(12.5);
    expect(sheet.getCell('E3').value).toBe(-0.1);
    expect(sheet.getCell('E2').numFmt).toContain('R$');
    expect(sheet.autoFilter).toBe('A1:E4');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getCell('A1').font.bold).toBe(true);
  });

  it('creates a valid empty workbook with headers and filters', async () => {
    const service = new TransactionXlsxService();
    const filePath = join(directory, 'vazio.xlsx');
    const output = createWriteStream(filePath);
    const done = finished(output);
    await service.finalizeDocument(service.createDocument(output));
    await done;
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Transações');
    expect(sheet.rowCount).toBe(1);
    expect(sheet.getCell('E1').value).toBe('Valor');
    expect(sheet.autoFilter).toBe('A1:E1');
  });

  it('continues on another worksheet when the Excel row limit is reached', async () => {
    const service = new TransactionXlsxService();
    const filePath = join(directory, 'abas.xlsx');
    const output = createWriteStream(filePath);
    const done = finished(output);
    const document = service.createDocument(output);
    // Simulamos apenas a fronteira, evitando criar um milhão de registros no
    // teste. O arquivo reaberto deve conter o lançamento na segunda aba.
    document.sheetRows = 1_048_576;
    service.addTransaction(document, transaction());
    await service.finalizeDocument(document);
    await done;
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);
    expect(workbook.worksheets).toHaveLength(2);
    expect(workbook.getWorksheet('Transações 2').getCell('C2').value).toBe(
      'Alimentação',
    );
    expect(workbook.getWorksheet('Transações 2').autoFilter).toBe('A1:E2');
  });
});
