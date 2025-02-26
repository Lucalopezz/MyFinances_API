import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AppModule } from '../app/app.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [AppModule],
})
export class DashboardModule {}
