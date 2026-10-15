import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CategoriesModule } from '../../categories/categories.module';
import { TransactionsModule } from '../transactions.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,

    AuthModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository],
})
export class ImportsModule {}
