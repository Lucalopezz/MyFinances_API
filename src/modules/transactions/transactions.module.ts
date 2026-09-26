import { forwardRef, Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AppModule } from '../app/app.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { TransactionsRepository } from './repositories/transactions.repository';

@Module({
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    FinancialDataEncryptionService,
  ],
  exports: [TransactionsRepository],
  imports: [forwardRef(() => AppModule), WishlistModule, AuthModule],
})
export class TransactionsModule {}
