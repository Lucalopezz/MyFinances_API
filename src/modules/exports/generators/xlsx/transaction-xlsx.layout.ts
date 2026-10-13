import { TransactionXlsxDocument } from './transaction-xlsx.types';

export const MAX_XLSX_SHEET_ROWS = 1_048_576;
export const XLSX_CURRENCY_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

// A criação e a confirmação de abas usam a mesma configuração em históricos
// pequenos e em arquivos que ultrapassam o limite de linhas de uma planilha.
export function addXlsxWorksheet(document: TransactionXlsxDocument): void {
  document.sheetNumber++;
  document.sheetRows = 1;
  document.worksheet = document.workbook.addWorksheet(
    document.sheetNumber === 1
      ? 'Transações'
      : `Transações ${document.sheetNumber}`,
    {
      // Cabeçalho congelado facilita consultar históricos extensos. A
      // configuração de impressão mantém as cinco colunas na mesma página.
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '1:1',
      },
    },
  );
  document.worksheet.columns = [
    { header: 'Data', width: 14 },
    { header: 'Descrição', width: 60 },
    { header: 'Categoria', width: 26 },
    { header: 'Tipo', width: 14 },
    { header: 'Valor', width: 22 },
  ];
  const header = document.worksheet.getRow(1);
  header.height = 26;
  header.font = {
    name: 'Arial',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF172B3A' },
  };
  header.alignment = { vertical: 'middle' };
  header.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
  header.commit();
}

export function commitXlsxWorksheet(document: TransactionXlsxDocument): void {
  // O intervalo é definido ao terminar a aba para incluir todos os lotes.
  // Mesmo uma exportação vazia mantém cabeçalho, filtro e um XLSX válido.
  document.worksheet.autoFilter = `A1:E${document.sheetRows}`;
  document.worksheet.commit();
}
