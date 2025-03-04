import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto, DashboardQuerySchema } from './dtos/dashboard.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('dashboard')
@UseGuards(AuthTokenGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboardData(
    @Query(new ZodValidationPipe(DashboardQuerySchema))
    query: DashboardQueryDto,
    @User('sub') userId: string,
  ) {
    return this.dashboardService.getDashboardData(query, userId);
  }

  @Get('monthly-comparison')
  async getMonthlyComparison(
    @Query(new ZodValidationPipe(DashboardQuerySchema))
    query: DashboardQueryDto,
    @User('sub') userId: string,
  ) {
    return this.dashboardService.getMonthlyComparison(query, userId);
  }
}
