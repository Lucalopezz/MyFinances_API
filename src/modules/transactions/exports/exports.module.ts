import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { CategoriesModule } from '../../categories/categories.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TRANSACTION_EXPORT_QUEUE } from './constants/exports.constants';
import { ExportsController } from './exports.controller';
import { ExportsService } from './services/exports.service';
import { TransactionExportProcessor } from './processors/transaction-export.processor';
import { TransactionPdfService } from './generators/pdf/transaction-pdf.service';
import { TransactionCsvService } from './generators/csv/transaction-csv.service';
import { TransactionXlsxService } from './generators/xlsx/transaction-xlsx.service';
import { TransactionExportsRepository } from './repositories/transaction-exports.repository';
import { TransactionsModule } from '../transactions.module';
import { TransactionExportReaderService } from './services/transaction-export-reader.service';
import { TransactionExportWriterFactory } from './services/transaction-export-writer.factory';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    AuthModule,
    TransactionsModule,
    // Registra a fila compartilhada pelo serviço que agenda os jobs e pelo worker que os executa.
    BullModule.registerQueue({
      name: TRANSACTION_EXPORT_QUEUE,
    }),
  ],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    TransactionExportsRepository,
    TransactionExportProcessor,
    TransactionPdfService,
    TransactionCsvService,
    TransactionXlsxService,
    TransactionExportReaderService,
    TransactionExportWriterFactory,
  ],
})
export class ExportsModule {}
