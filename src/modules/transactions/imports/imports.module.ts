import { ImportHistoryService } from './services/import-history.service';
import { ImportConfirmationService } from './services/import-confirmation.service';
import { ImportCleanupService } from './services/import-cleanup.service';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CategoriesModule } from '../../categories/categories.module';
import { TransactionsModule } from '../transactions.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './repositories/imports.repository';
import { ImportsService } from './services/imports.service';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ImportsRepository,
    ImportHistoryService,
    ImportConfirmationService,
    ImportCleanupService,
  ],
})
export class ImportsModule {}
