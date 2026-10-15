import { Module } from '@nestjs/common';
import { FinancialDataEncryptionService } from './financial-data-encryption.service';

/** Mantém a configuração da chave financeira em um único provider compartilhado. */
@Module({
  providers: [FinancialDataEncryptionService],
  exports: [FinancialDataEncryptionService],
})
export class EncryptionModule {}
