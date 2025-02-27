import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto, DashboardQuerySchema } from './dtos/dashboard.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboardData(
    @Query(new ZodValidationPipe(DashboardQuerySchema))
    query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDashboardData(query);
  }
}
