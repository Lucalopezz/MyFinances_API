import { Injectable } from '@nestjs/common';
import { stream } from 'exceljs';
import { WriteStream } from 'fs';
import { DecryptedTransaction } from '../../../mappers/transaction-encryption.mapper';
import {
  buildExportCategoryNames,
  ExportCategoryCatalog,
  formatExportCategory,
  formatExportType,
} from '../../helpers/transaction-export-formatting.helper';
import {
  StreamingWorkbook,
  TransactionXlsxDocument,
} from './transaction-xlsx.types';
import {
  addXlsxWorksheet,
  commitXlsxWorksheet,
  MAX_XLSX_SHEET_ROWS,
  XLSX_CURRENCY_FORMAT,
} from './transaction-xlsx.layout';

const MAX_CELL_CHARACTERS = 32_767;

@Injectable()
export class TransactionXlsxService {
  /**
   * Inicia um XLSX nativo escrito diretamente no arquivo da exportação.
   * Cada linha é confirmada e liberada; shared strings ficam desativadas
   * para não acumular todas as descrições do histórico em um catálogo global.
   */
  createDocument(
    output: WriteStream,
    catalog: ExportCategoryCatalog = [],
  ): TransactionXlsxDocument {
    const workbook = new stream.xlsx.WorkbookWriter({
      stream: output,
      useStyles: true,
      useSharedStrings: false,
    }) as StreamingWorkbook;
    workbook.creator = 'MyFinances';
    workbook.zip.on('error', (error) => output.destroy(error));

    const document: TransactionXlsxDocument = {
      workbook,
      worksheet: undefined,
      categoryNames: buildExportCategoryNames(catalog),
      sheetNumber: 0,
      sheetRows: 0,
    };
    addXlsxWorksheet(document);
    return document;
  }

  /**
   * Preserva datas e números como células tipadas, para ordenar e calcular
   * no Excel. Descrições e nomes são strings, inclusive quando começam com
   * `=`: o ExcelJS só cria fórmulas ao receber um objeto de fórmula explícito.
   */
  addTransaction(
    document: TransactionXlsxDocument,
    transaction: DecryptedTransaction,
  ): void {
    const description = transaction.description ?? '';
    const category = formatExportCategory(
      document.categoryNames,
      transaction.category,
    );
    // O Excel tem um limite por célula. Falhar explicitamente é preferível
    // a entregar uma planilha inválida ou truncar a descrição silenciosamente.
    if (description.length > MAX_CELL_CHARACTERS) {
      throw new Error(
        'A descrição ultrapassa o limite de uma célula do Excel.',
      );
    }
    // O limite inclui o cabeçalho. Históricos maiores continuam em outra aba,
    // repetindo as colunas sem descartar lançamentos nem criar linhas inválidas.
    if (document.sheetRows === MAX_XLSX_SHEET_ROWS) {
      commitXlsxWorksheet(document);
      addXlsxWorksheet(document);
    }

    const row = document.worksheet.addRow([
      transaction.date,
      description,
      category,
      formatExportType(transaction.type),
      transaction.value,
    ]);
    const color = transaction.type === 'INCOME' ? 'FF157347' : 'FFB42318';
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF172B3A' } };
    row.alignment = { vertical: 'top', wrapText: true };
    // A altura considera descrição e categoria: um nome personalizado longo
    // também pode quebrar em linhas. A estimativa deixa margem na largura e
    // respeita o teto do Excel; o texto integral continua armazenado na célula.
    const linesFor = (value: string, width: number) =>
      value
        .split('\n')
        .reduce(
          (lines, line) => lines + Math.max(1, Math.ceil(line.length / width)),
          0,
        );
    row.height = Math.min(
      409,
      Math.max(
        22,
        Math.max(linesFor(description, 55), linesFor(category, 22)) * 14 + 8,
      ),
    );
    if (document.sheetRows % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6F8' },
      };
    }
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    // Datas alinhadas à esquerda deixam espaço antes da descrição, evitando
    // que o fim da data pareça fazer parte do texto na coluna seguinte.
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left' };
    row.getCell(4).font = { name: 'Arial', size: 10, color: { argb: color } };
    row.getCell(5).numFmt = XLSX_CURRENCY_FORMAT;
    row.getCell(5).font = { name: 'Arial', size: 10, color: { argb: color } };
    row.getCell(5).alignment = { vertical: 'top', horizontal: 'right' };
    row.commit();
    document.sheetRows++;
  }

  /** Fecha as abas e o ZIP antes de o worker liberar o download. */
  async finalizeDocument(document: TransactionXlsxDocument): Promise<void> {
    commitXlsxWorksheet(document);
    await document.workbook.commit();
  }

  /** Cancela o ZIP parcial; o worker fecha o arquivo e remove seu conteúdo. */
  abortDocument(document: TransactionXlsxDocument): void {
    document.workbook.zip.abort();
  }
}
