import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { AuthModule } from '../auth/auth.module';
import { AppModule } from '../app/app.module';
import { TRANSACTION_EXPORT_QUEUE } from './exports.constants';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { TransactionExportProcessor } from './transaction-export.processor';
import { TransactionPdfService } from './transaction-pdf.service';
import { TransactionCsvService } from './transaction-csv.service';
import { TransactionExportsRepository } from './repositories/transaction-exports.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    forwardRef(() => AppModule),
    AuthModule,
    TransactionsModule,
    // Configure the Bull queue for transaction exports
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
    FinancialDataEncryptionService,
  ],
})
export class ExportsModule {}
