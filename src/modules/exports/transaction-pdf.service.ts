import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import {
  CategoryView,
  DEFAULT_CATEGORIES,
} from '../categories/default-categories';
import { DecryptedTransaction } from '../transactions/transaction-encryption.mapper';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';

const MARGIN = 40;
const ROW_PADDING = 8;
const TEXT_OPTIONS = { lineGap: 1 };
const COLORS = {
  text: '#172b3a',
  muted: '#607080',
  border: '#dce4e8',
  background: '#f3f6f8',
  income: '#157347',
  expense: '#b42318',
};
// As larguras somam 515,28 pontos: a largura de uma página A4 menos as duas
// margens de 40 pontos. Cabeçalhos e células usam a mesma divisão para alinhar
// as colunas, independentemente de quantas linhas cada texto ocupar.
const COLUMNS = [
  { label: 'Data', width: 66 },
  { label: 'Descrição', width: 176 },
  { label: 'Categoria', width: 114 },
  { label: 'Tipo', width: 57 },
  { label: 'Valor', width: 102.28 },
];

type ReportState = {
  categoryNames: Map<string, string>;
  period: string;
  generatedAt: string;
  filters: string;
  page: number;
  tableStart: number;
  count: number;
  incomeCents: number;
  expenseCents: number;
};

@Injectable()
export class TransactionPdfService {
  // O serviço é compartilhado pelo Nest, mas os totais e filtros pertencem a
  // cada documento. O WeakMap isola exportações e permite liberar um documento
  // descartado sem manter referências permanentes a ele dentro do serviço.
  private readonly reports = new WeakMap<PDFKit.PDFDocument, ReportState>();
  // Reutilizamos o mesmo formatador na tabela e na conversão para centavos:
  // os totais devem somar exatamente os valores que o usuário vê nas linhas.
  private readonly currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  /**
   * Inicia o relatório e seu estado, sem carregar as transações na memória.
   * O processador envia os lançamentos em lotes e finaliza o documento ao fim.
   * O catálogo recebido deve pertencer ao usuário que solicitou a exportação.
   */
  createDocument(
    filters?: CreateTransactionExportDto,
    catalog: ReadonlyArray<Pick<CategoryView, 'id' | 'name'>> = [],
  ): PDFKit.PDFDocument {
    const document = new PDFDocument({
      margin: MARGIN,
      size: 'A4',
      info: {
        Title: 'Relatório de transações - MyFinances',
        Author: 'MyFinances',
        Subject: 'Movimentações financeiras em reais',
      },
    });
    // Os registros guardam códigos/IDs, enquanto o relatório mostra nomes.
    // As categorias padrão garantem a tradução mesmo sem catálogo; os nomes
    // recebidos depois prevalecem e preservam as categorias personalizadas.
    // O Map evita pesquisar todo o catálogo novamente para cada lançamento.
    const categoryNames = new Map(
      [...DEFAULT_CATEGORIES, ...catalog].map(({ id, name }) => [id, name]),
    );
    // Congelamos o período, os filtros e o horário de geração neste momento
    // para repetir a mesma identificação em todas as páginas do relatório.
    this.reports.set(document, {
      categoryNames,
      period: this.formatPeriod(filters),
      generatedAt: this.formatDateTime(new Date()),
      filters: [
        `Tipo: ${filters?.type ? this.formatType(filters.type) : 'Todos'}`,
        `Categoria: ${filters?.categoryId ? this.formatCategory(categoryNames, filters.categoryId) : 'Todas'}`,
      ].join(' | '),
      page: 1,
      tableStart: 0,
      count: 0,
      incomeCents: 0,
      expenseCents: 0,
    });
    this.addPageHeader(document);
    this.addTableHeader(document);
    return document;
  }

  /**
   * Renderiza um lançamento já filtrado e o inclui nos totais uma única vez,
   * mesmo quando sua descrição precisa continuar em várias páginas.
   */
  addTransaction(
    document: PDFKit.PDFDocument,
    transaction: DecryptedTransaction,
  ): void {
    const state = this.reports.get(document);
    const cells = [
      this.formatDate(transaction.date),
      transaction.description?.trim() ? transaction.description : '-',
      this.formatCategory(state.categoryNames, transaction.category),
      this.formatType(transaction.type),
      this.formatCurrency(transaction.value),
    ];
    // A medição precisa usar a mesma fonte das células, pois os cabeçalhos
    // deixam uma fonte diferente ativa e isso mudaria a altura calculada.
    this.setRowFont(document);
    const height = this.rowHeight(document, cells);
    // Tentamos manter a linha inteira na próxima página quando falta espaço.
    // Em uma página ainda vazia, uma linha maior que a área útil será dividida;
    // abrir outra página nesse caso repetiria a tentativa indefinidamente.
    if (
      document.y + height > this.contentBottom(document) &&
      document.y > state.tableStart
    ) {
      this.addPage(document, true);
    }

    // Cada célula guarda somente o texto que ainda falta desenhar. Assim,
    // descrições maiores que uma página continuam sem truncar o conteúdo nem
    // repetir os valores e as demais células já exibidas na primeira parte.
    let remaining = cells;
    while (remaining.some((cell) => cell.length > 0)) {
      this.setRowFont(document);
      const available =
        this.contentBottom(document) - document.y - 2 * ROW_PADDING;
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
      );
      remaining = parts.map(([, rest]) => rest);
      if (remaining.some((cell) => cell.length > 0)) {
        this.addPage(document, true);
      }
    }

    // A contagem e a soma ficam fora do laço de fragmentos: uma transação
    // repartida entre páginas continua representando apenas um lançamento.
    state.count++;
    const cents = this.currencyCents(transaction.value);
    if (transaction.type === 'INCOME') state.incomeCents += cents;
    else state.expenseCents += cents;
  }

  /**
   * Acrescenta o resumo depois do último lote e encerra o stream do PDF.
   * Calcular o resumo no final permite manter apenas contadores em memória,
   * sem guardar todas as transações ou reabrir páginas já escritas.
   */
  finalizeDocument(document: PDFKit.PDFDocument): void {
    const state = this.reports.get(document);
    if (state.count === 0) {
      document
        .font('Helvetica')
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text(
          'Nenhuma transação encontrada para os filtros selecionados.',
          MARGIN,
          document.y + 18,
          {
            width: this.contentWidth(document),
          },
        );
      document.moveDown(1);
    }

    // O resumo e o rodapé precisam ser desenhados antes de end(), que encerra
    // a produção do PDF. O processador ainda aguarda a gravação do arquivo.
    this.addSummary(document);
    this.addFooter(document);
    this.reports.delete(document);
    document.end();
  }

  private addPageHeader(document: PDFKit.PDFDocument): void {
    const state = this.reports.get(document);
    const width = this.contentWidth(document);
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

  private addTableHeader(document: PDFKit.PDFDocument): void {
    const y = document.y;
    document.rect(MARGIN, y, this.contentWidth(document), 27).fill(COLORS.text);
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
    this.reports.get(document).tableStart = document.y;
    this.setRowFont(document);
  }

  private drawRow(
    document: PDFKit.PDFDocument,
    cells: string[],
    type: TransactionType,
  ): void {
    const state = this.reports.get(document);
    const y = document.y;
    const height = this.rowHeight(document, cells);
    // O índice é o da transação, não o do fragmento: continuações mantêm a
    // mesma cor de fundo, ajudando a identificar a qual lançamento pertencem.
    if (state.count % 2 === 0) {
      document
        .rect(MARGIN, y, this.contentWidth(document), height)
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

  private addSummary(document: PDFKit.PDFDocument): void {
    const state = this.reports.get(document);
    const gap = 10;
    const width = (this.contentWidth(document) - 2 * gap) / 3;
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
          document.heightOfString(this.formatCurrency(value / 100), {
            width: width - 24,
          }),
      ),
    );
    // Reservamos também o título, a contagem e os espaçamentos. Se o bloco
    // inteiro não couber, ele começa em outra página sem cabeçalho de tabela.
    if (document.y + cardHeight + 74 > this.contentBottom(document)) {
      this.addPage(document, false);
    }
    const y = document.y + 24;
    document
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(COLORS.text)
      .text('Resumo do período', MARGIN, y, {
        width: this.contentWidth(document),
      })
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(
        state.count === 1
          ? '1 transação exportada'
          : `${state.count.toLocaleString('pt-BR')} transações exportadas`,
        { width: this.contentWidth(document) },
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
        .text(this.formatCurrency(value / 100), x + 12, cardY + 31, {
          width: width - 24,
        });
    });
    document.y = cardY + cardHeight;
  }

  private addPage(document: PDFKit.PDFDocument, withTable: boolean): void {
    // Fechamos a página atual antes de abrir a próxima, pois o PDF é escrito
    // em fluxo e não mantém páginas anteriores para inserir rodapés depois.
    // A página do resumo usa withTable=false porque não contém lançamentos.
    this.addFooter(document);
    document.addPage();
    this.reports.get(document).page++;
    this.addPageHeader(document);
    if (withTable) this.addTableHeader(document);
  }

  private addFooter(document: PDFKit.PDFDocument): void {
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
        width: this.contentWidth(document),
      })
      .text(`Página ${this.reports.get(document).page}`, MARGIN, y, {
        width: this.contentWidth(document),
        align: 'right',
      });
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

  private contentWidth(document: PDFKit.PDFDocument): number {
    return document.page.width - 2 * MARGIN;
  }

  private contentBottom(document: PDFKit.PDFDocument): number {
    // A tabela termina antes do rodapé, que começa a 56 pontos da base.
    // Essa reserva evita que linhas ou cartões encostem na identificação.
    return document.page.height - 86;
  }

  private formatCategory(
    categoryNames: Map<string, string>,
    category: string,
  ): string {
    // Uma referência ausente não deve aparecer como código em inglês ou ID
    // técnico no relatório. Mantemos uma indicação legível sem inventar nome.
    return categoryNames.get(category) ?? 'Categoria indisponível';
  }

  private formatPeriod(filters?: CreateTransactionExportDto): string {
    if (!filters?.startDate && !filters?.endDate) return 'Todos os períodos';
    // Filtros recuperados do JSON persistido podem trazer datas como strings,
    // apesar do tipo do DTO. A conversão aceita os dois formatos em execução.
    const start = filters.startDate
      ? this.formatDate(new Date(filters.startDate))
      : 'início';
    const end = filters.endDate
      ? this.formatDate(new Date(filters.endDate))
      : 'hoje';
    return `${start} a ${end}`;
  }

  private formatDate(date: Date): string {
    // As datas dos lançamentos são armazenadas em UTC. Exibi-las no fuso de
    // Brasília deslocaria uma data à meia-noite para o dia anterior.
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
  }

  private formatDateTime(date: Date): string {
    // O horário de geração representa um instante, e não a data financeira
    // de um lançamento; por isso ele é mostrado no horário de Brasília.
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  private currencyCents(value: number): number {
    // Usamos o arredondamento do mesmo Intl que desenha os valores:
    // 1.005 aparece como R$ 1,01, mas Math.round(1.005 * 100) produziria 100
    // por imprecisão binária. Juntar os dígitos formatados produz 101 centavos
    // e mantém os totais iguais à soma das quantias exibidas na tabela.
    const cents = Number(
      this.currencyFormatter
        .formatToParts(value)
        .filter(({ type }) => type === 'integer' || type === 'fraction')
        .map(({ value }) => value)
        .join(''),
    );
    // As partes numéricas não incluem o sinal; ele precisa ser reaplicado
    // para preservar o comportamento de registros com valores negativos.
    return value < 0 ? -cents : cents;
  }

  private formatType(type: TransactionType): string {
    return type === 'INCOME' ? 'Receita' : 'Despesa';
  }
}
