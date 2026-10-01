import { forwardRef, Module } from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  imports: [
    forwardRef(() => AppModule),
    AuthModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ImportsRepository,
    FinancialDataEncryptionService,
  ],
})
export class ImportsModule {}
