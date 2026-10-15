import { Module } from '@nestjs/common';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { RecurringIncomeEncryptionMapper } from './mappers/recurring-income-encryption.mapper';
import { RecurringIncomesController } from './recurring-incomes.controller';
import { RecurringIncomesRepository } from './repositories/recurring-incomes.repository';
import { RecurringIncomesService } from './services/recurring-incomes.service';

@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule, CategoriesModule],
  controllers: [RecurringIncomesController],
  providers: [
    RecurringIncomesService,
    RecurringIncomesRepository,
    RecurringIncomeEncryptionMapper,
  ],
  exports: [RecurringIncomesService],
})
export class RecurringIncomesModule {}
