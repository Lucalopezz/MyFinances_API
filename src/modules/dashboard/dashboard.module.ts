import { forwardRef, Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AppModule } from '../app/app.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [forwardRef(() => AppModule)],
})
export class DashboardModule {}
