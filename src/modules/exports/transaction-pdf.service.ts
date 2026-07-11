import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import { DecryptedTransaction } from '../transactions/transaction-encryption.mapper';
import { CreateTransactionExportDto } from './dtos/create-transaction-export.dto';

@Injectable()
export class TransactionPdfService {
  createDocument(filters?: CreateTransactionExportDto): PDFKit.PDFDocument {
    // An A4 page is 595.28 x 841.89 points
    const document = new PDFDocument({ margin: 40, size: 'A4' });

    document.fontSize(18).text('Exportação de transações', { align: 'center' });
    document.moveDown(0.5);
    document
      .fontSize(10)
      .text(`Período: ${this.formatPeriod(filters)}`)
      .text(`Gerado em: ${this.formatDateTime(new Date())}`);
    document.moveDown();
    this.addHeader(document);

    return document;
  }

  addTransaction(
    document: PDFKit.PDFDocument,
    transaction: DecryptedTransaction,
  ): void {
    const description = transaction.description || '-';
    const category = transaction.category;
    const rowHeight = Math.max(
      14,
      document.heightOfString(description, { width: 160 }),
      document.heightOfString(category, { width: 135 }),
    );

    if (document.y + rowHeight > 770) {
      document.addPage();
      this.addHeader(document);
    }

    const y = document.y;
    document
      .font('Helvetica')
      .fontSize(8)
      .text(this.formatDate(transaction.date), 40, y, { width: 65 })
      .text(description, 105, y, { width: 160 })
      .text(this.formatType(transaction.type), 265, y, { width: 55 })
      .text(this.formatCurrency(transaction.value), 320, y, {
        width: 90,
        align: 'right',
      })
      .text(category, 420, y, { width: 135 });

    document.y = y + rowHeight + 5;
    document
      .moveTo(40, document.y)
      .lineTo(555, document.y)
      .strokeColor('#dddddd')
      .stroke();
    document.y += 5;
  }

  private addHeader(document: PDFKit.PDFDocument): void {
    const y = document.y;
    document
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Data', 40, y, { width: 65 })
      .text('Descrição', 105, y, { width: 160 })
      .text('Tipo', 265, y, { width: 55 })
      .text('Valor', 320, y, { width: 90, align: 'right' })
      .text('Categoria', 420, y, { width: 135 });
    document.y = y + 16;
    document
      .moveTo(40, document.y)
      .lineTo(555, document.y)
      .strokeColor('#999999')
      .stroke();
    document.y += 6;
  }

  private formatPeriod(filters?: CreateTransactionExportDto): string {
    if (!filters?.startDate && !filters?.endDate) {
      return 'Todos os períodos';
    }

    const start = filters.startDate
      ? this.formatDate(filters.startDate)
      : 'início';
    const end = filters.endDate ? this.formatDate(filters.endDate) : 'hoje';
    return `${start} a ${end}`;
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private formatType(type: TransactionType): string {
    return type === 'INCOME' ? 'Receita' : 'Despesa';
  }
}
