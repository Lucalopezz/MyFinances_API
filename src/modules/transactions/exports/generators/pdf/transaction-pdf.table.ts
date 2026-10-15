import { TransactionType } from '@prisma/client';
import { DecryptedTransaction } from '../../../mappers/transaction-encryption.mapper';
import {
  formatExportCategory,
  formatExportCurrency,
  formatExportDate,
  formatExportType,
} from '../../helpers/transaction-export-formatting.helper';
import {
  COLORS,
  COLUMNS,
  MARGIN,
  ROW_PADDING,
  TEXT_OPTIONS,
  pdfContentWidth,
  pdfContentBottom,
} from './transaction-pdf.constants';
import { PdfReportState } from './transaction-pdf.types';

// A medição e o desenho das células ficam juntos para usar as mesmas fontes,
// larguras e quebras. A tabela solicita páginas novas sem controlar os totais.
export class TransactionPdfTable {
  addHeader(document: PDFKit.PDFDocument, state: PdfReportState): void {
    const y = document.y;
    document.rect(MARGIN, y, pdfContentWidth(document), 27).fill(COLORS.text);
    document.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    let x = MARGIN;
    COLUMNS.forEach((column, index) => {
      document.text(column.label, x + ROW_PADDING, y + 9, {
        width: column.width - 2 * ROW_PADDING,
        align: index === 4 ? 'right' : 'left',
      });
      x += column.width;
    });
    // Guardamos o começo da área de dados para distinguir uma página vazia
    // de outra que já tem lançamentos ao decidir sobre a quebra de página.
    document.y = y + 27;
    state.tableStart = document.y;
    this.setRowFont(document);
  }

  /** Desenha todas as partes da linha, preservando textos maiores que uma página. */
  addTransaction(
    document: PDFKit.PDFDocument,
    state: PdfReportState,
    transaction: DecryptedTransaction,
    newPage: () => void,
  ): void {
    const cells = [
      formatExportDate(transaction.date),
      transaction.description?.trim() ? transaction.description : '-',
      formatExportCategory(state.categoryNames, transaction.category),
      formatExportType(transaction.type),
      formatExportCurrency(transaction.value),
    ];
    // A medição precisa usar a mesma fonte das células, pois os cabeçalhos
    // deixam uma fonte diferente ativa e isso mudaria a altura calculada.
    this.setRowFont(document);
    const height = this.rowHeight(document, cells);
    // Tentamos manter a linha inteira na próxima página quando falta espaço.
    // Em uma página ainda vazia, uma linha maior que a área útil será dividida;
    // abrir outra página nesse caso repetiria a tentativa indefinidamente.
    if (
      document.y + height > pdfContentBottom(document) &&
      document.y > state.tableStart
    ) {
      newPage();
    }

    // Cada célula guarda somente o texto que ainda falta desenhar. Assim,
    // descrições maiores que uma página continuam sem truncar o conteúdo nem
    // repetir os valores e as demais células já exibidas na primeira parte.
    let remaining = cells;
    while (remaining.some((cell) => cell.length > 0)) {
      this.setRowFont(document);
      const available =
        pdfContentBottom(document) - document.y - 2 * ROW_PADDING;
      const parts = remaining.map((cell, index) =>
        this.fitText(
          document,
          cell,
          COLUMNS[index].width - 2 * ROW_PADDING,
          available,
        ),
      );
      this.drawRow(
        document,
        parts.map(([text]) => text),
        transaction.type,
        state,
      );
      remaining = parts.map(([, rest]) => rest);
      if (remaining.some((cell) => cell.length > 0)) {
        newPage();
      }
    }
  }

  private drawRow(
    document: PDFKit.PDFDocument,
    cells: string[],
    type: TransactionType,
    state: PdfReportState,
  ): void {
    const y = document.y;
    const height = this.rowHeight(document, cells);
    // O índice é o da transação, não o do fragmento: continuações mantêm a
    // mesma cor de fundo, ajudando a identificar a qual lançamento pertencem.
    if (state.count % 2 === 0) {
      document
        .rect(MARGIN, y, pdfContentWidth(document), height)
        .fill(COLORS.background);
    }
    let x = MARGIN;
    cells.forEach((cell, index) => {
      document
        .fillColor(
          index >= 3
            ? type === 'INCOME'
              ? COLORS.income
              : COLORS.expense
            : COLORS.text,
        )
        .text(cell, x + ROW_PADDING, y + ROW_PADDING, {
          ...TEXT_OPTIONS,
          width: COLUMNS[index].width - 2 * ROW_PADDING,
          align: index === 4 ? 'right' : 'left',
        });
      x += COLUMNS[index].width;
    });
    document
      .moveTo(MARGIN, y + height)
      .lineTo(document.page.width - MARGIN, y + height)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    // PDFKit move o cursor ao escrever cada célula. Reposicionamos a próxima
    // linha pela maior altura medida, evitando sobreposição quando uma
    // descrição ocupa mais linhas que a última coluna desenhada.
    document.y = y + height;
  }

  private setRowFont(document: PDFKit.PDFDocument): void {
    document.font('Helvetica').fontSize(8).fillColor(COLORS.text);
  }

  private rowHeight(document: PDFKit.PDFDocument, cells: string[]): number {
    // Cada coluna pode quebrar em uma quantidade diferente de linhas. A
    // maior altura, somada ao padding superior e inferior, define a linha.
    return (
      2 * ROW_PADDING +
      Math.max(
        12,
        ...cells.map((cell, index) =>
          document.heightOfString(cell, {
            ...TEXT_OPTIONS,
            width: COLUMNS[index].width - 2 * ROW_PADDING,
          }),
        ),
      )
    );
  }

  /**
   * Retorna o trecho que cabe na célula e o restante para a próxima página.
   * Mede a altura real do PDFKit; uma contagem fixa de caracteres falharia
   * porque letras, espaços e quebras de linha ocupam tamanhos diferentes.
   */
  private fitText(
    document: PDFKit.PDFDocument,
    text: string,
    width: number,
    height: number,
  ): [string, string] {
    const fits = (value: string) =>
      document.heightOfString(value, { ...TEXT_OPTIONS, width }) <= height;
    if (fits(text)) return [text, ''];
    // A busca binária encontra o maior prefixo que cabe sem precisar medir
    // cada comprimento possível de uma descrição extensa.
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(text.slice(0, middle))) low = middle;
      else high = middle - 1;
    }
    // Preferimos uma fronteira entre palavras. Um texto sem espaços ainda
    // pode ser dividido pelo limite medido. Não usamos trim() nas partes,
    // pois isso descartaria caracteres do conteúdo original entre páginas.
    const lastSpace = text.slice(0, low).search(/\s+\S*$/);
    const split = lastSpace > 0 ? lastSpace + 1 : low;
    return [text.slice(0, split), text.slice(split)];
  }
}
