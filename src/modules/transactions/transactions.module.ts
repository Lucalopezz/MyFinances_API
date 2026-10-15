import { TransactionQueriesService } from './services/transaction-queries.service';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { CategoriesModule } from '../categories/categories.module';
import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../auth/auth.module';
import { TransactionsRepository } from './repositories/transactions.repository';

@Module({
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    TransactionQueriesService,
  ],
  exports: [TransactionQueriesService],
  imports: [PrismaModule, EncryptionModule, CategoriesModule, AuthModule],
})
export class TransactionsModule {}
