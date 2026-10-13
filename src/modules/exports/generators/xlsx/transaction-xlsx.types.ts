import { stream, Worksheet } from 'exceljs';

// O writer expõe o Archiver em `zip`, mas a tipagem do ExcelJS não o declara.
// Precisamos somente de abort() e do evento de erro para cancelar a geração
// quando a consulta ou a gravação falhar, sem deixar um ZIP em produção.
export type StreamingWorkbook = stream.xlsx.WorkbookWriter & {
  zip: {
    abort(): void;
    on(event: 'error', callback: (error: Error) => void): void;
  };
};

export type TransactionXlsxDocument = {
  workbook: StreamingWorkbook;
  worksheet: Worksheet;
  categoryNames: Map<string, string>;
  sheetNumber: number;
  sheetRows: number;
};
