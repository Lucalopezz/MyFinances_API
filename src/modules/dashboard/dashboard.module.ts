import { forwardRef, Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, FinancialDataEncryptionService],
  imports: [forwardRef(() => AppModule), AuthModule],
})
export class DashboardModule {}
