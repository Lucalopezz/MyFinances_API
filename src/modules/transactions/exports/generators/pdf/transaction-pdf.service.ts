import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { DecryptedTransaction } from '../../../mappers/transaction-encryption.mapper';
import { CreateTransactionExportDto } from '../../dto/create-transaction-export.dto';
import {
  buildExportCategoryNames,
  ExportCategoryCatalog,
  exportValueInCents,
  formatExportCategory,
  formatExportDateTime,
  formatExportPeriod,
  formatExportType,
} from '../../helpers/transaction-export-formatting.helper';
import { MARGIN } from './transaction-pdf.constants';
import { TransactionPdfLayout } from './transaction-pdf.layout';
import { TransactionPdfTable } from './transaction-pdf.table';
import { PdfReportState } from './transaction-pdf.types';

@Injectable()
export class TransactionPdfService {
  // O serviço controla o ciclo do documento e seus totais. Os renderizadores
  // recebem esse estado explicitamente e cuidam somente da apresentação.
  // WeakMap evita compartilhar dados entre exportações e reter PDFs descartados.
  private readonly reports = new WeakMap<PDFKit.PDFDocument, PdfReportState>();
  private readonly layout = new TransactionPdfLayout();
  private readonly table = new TransactionPdfTable();

  /** Inicia um PDF em fluxo, com o catálogo exclusivo do usuário solicitante. */
  createDocument(
    filters?: CreateTransactionExportDto,
    catalog: ExportCategoryCatalog = [],
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
    const categoryNames = buildExportCategoryNames(catalog);
    // A identificação é calculada uma vez, para manter período, filtros e
    // horário de geração consistentes em todas as páginas do mesmo arquivo.
    const state: PdfReportState = {
      categoryNames,
      period: formatExportPeriod(filters),
      generatedAt: formatExportDateTime(new Date()),
      filters: [
        `Tipo: ${filters?.type ? formatExportType(filters.type) : 'Todos'}`,
        `Categoria: ${filters?.categoryId ? formatExportCategory(categoryNames, filters.categoryId) : 'Todas'}`,
      ].join(' | '),
      page: 1,
      tableStart: 0,
      count: 0,
      incomeCents: 0,
      expenseCents: 0,
    };
    this.reports.set(document, state);
    this.layout.addPageHeader(document, state);
    this.table.addHeader(document, state);
    return document;
  }

  /**
   * Inclui cada lançamento uma vez no resumo, mesmo quando a tabela precisa
   * dividir sua descrição entre páginas. A leitura em lotes já aplicou filtros.
   */
  addTransaction(
    document: PDFKit.PDFDocument,
    transaction: DecryptedTransaction,
  ): void {
    const state = this.reports.get(document);
    this.table.addTransaction(document, state, transaction, () =>
      this.addPage(document, true),
    );
    state.count++;
    const cents = exportValueInCents(transaction.value);
    if (transaction.type === 'INCOME') state.incomeCents += cents;
    else state.expenseCents += cents;
  }

  /**
   * O resumo só é desenhado depois do último lote, sem guardar o histórico
   * na memória. Resumo e rodapé precedem end(), que encerra a produção do PDF.
   */
  finalizeDocument(document: PDFKit.PDFDocument): void {
    const state = this.reports.get(document);
    if (state.count === 0) this.layout.addEmptyState(document);
    this.layout.addSummary(document, state, () =>
      this.addPage(document, false),
    );
    this.layout.addFooter(document, state);
    this.reports.delete(document);
    document.end();
  }

  private addPage(document: PDFKit.PDFDocument, withTable: boolean): void {
    const state = this.reports.get(document);
    // O PDF não mantém páginas anteriores: o rodapé precisa ser fechado
    // antes da próxima página. O resumo usa uma página sem cabeçalho de tabela.
    this.layout.addFooter(document, state);
    document.addPage();
    state.page++;
    this.layout.addPageHeader(document, state);
    if (withTable) this.table.addHeader(document, state);
  }
}
