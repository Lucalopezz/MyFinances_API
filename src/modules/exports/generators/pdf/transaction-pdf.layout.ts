import { formatExportCurrency } from '../../helpers/transaction-export-formatting.helper';
import {
  COLORS,
  MARGIN,
  pdfContentWidth,
  pdfContentBottom,
} from './transaction-pdf.constants';
import { PdfReportState } from './transaction-pdf.types';

// Cuida da identificação, do resumo e do rodapé. Recebe o estado do relatório
// explicitamente; os totais e a ordem das páginas pertencem ao serviço do PDF.
export class TransactionPdfLayout {
  addPageHeader(document: PDFKit.PDFDocument, state: PdfReportState): void {
    const width = pdfContentWidth(document);
    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.income)
      .text('MYFINANCES', MARGIN, MARGIN, { width })
      .fontSize(21)
      .fillColor(COLORS.text)
      .text('Relatório de transações', MARGIN, 62, { width })
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(`Período: ${state.period}`, MARGIN, 96, { width })
      .text(`Gerado em: ${state.generatedAt} (horário de Brasília)`, { width })
      .text(state.filters, { width });
    document.y += 18;
  }

  addEmptyState(document: PDFKit.PDFDocument): void {
    document
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(
        'Nenhuma transação encontrada para os filtros selecionados.',
        MARGIN,
        document.y + 18,
        {
          width: pdfContentWidth(document),
        },
      );
    document.moveDown(1);
  }

  addSummary(
    document: PDFKit.PDFDocument,
    state: PdfReportState,
    newPage: () => void,
  ): void {
    const gap = 10;
    const width = (pdfContentWidth(document) - 2 * gap) / 3;
    // Os acumuladores recebem somente os lançamentos efetivamente exportados.
    // O saldo aqui é receitas menos despesas desses lançamentos, e não o
    // saldo geral do usuário fora dos filtros escolhidos para o relatório.
    const totals = [
      { label: 'Receitas', value: state.incomeCents, color: COLORS.income },
      { label: 'Despesas', value: state.expenseCents, color: COLORS.expense },
      {
        label: 'Saldo do período',
        value: state.incomeCents - state.expenseCents,
        color: COLORS.text,
      },
    ];
    document.font('Helvetica-Bold').fontSize(15);
    // Valores altos podem ocupar mais de uma linha. Todos os cartões recebem
    // a altura necessária ao maior valor para manter o resumo alinhado.
    const cardHeight = Math.max(
      67,
      ...totals.map(
        ({ value }) =>
          39 +
          document.heightOfString(formatExportCurrency(value / 100), {
            width: width - 24,
          }),
      ),
    );
    // Reservamos também o título, a contagem e os espaçamentos. Se o bloco
    // inteiro não couber, ele começa em outra página sem cabeçalho de tabela.
    if (document.y + cardHeight + 74 > pdfContentBottom(document)) {
      newPage();
    }
    const y = document.y + 24;
    document
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(COLORS.text)
      .text('Resumo do período', MARGIN, y, {
        width: pdfContentWidth(document),
      })
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(
        state.count === 1
          ? '1 transação exportada'
          : `${state.count.toLocaleString('pt-BR')} transações exportadas`,
        { width: pdfContentWidth(document) },
      );
    const cardY = document.y + 12;
    totals.forEach(({ label, value, color }, index) => {
      const x = MARGIN + index * (width + gap);
      document
        .roundedRect(x, cardY, width, cardHeight, 6)
        .fill(COLORS.background);
      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(label, x + 12, cardY + 12, { width: width - 24 })
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(color)
        .text(formatExportCurrency(value / 100), x + 12, cardY + 31, {
          width: width - 24,
        });
    });
    document.y = cardY + cardHeight;
  }

  addFooter(document: PDFKit.PDFDocument, state: PdfReportState): void {
    const y = document.page.height - 56;
    document
      .moveTo(MARGIN, y - 10)
      .lineTo(document.page.width - MARGIN, y - 10)
      .strokeColor(COLORS.border)
      .stroke()
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text('MyFinances | Valores em reais (BRL)', MARGIN, y, {
        width: pdfContentWidth(document),
      })
      .text(`Página ${state.page}`, MARGIN, y, {
        width: pdfContentWidth(document),
        align: 'right',
      });
  }
}
