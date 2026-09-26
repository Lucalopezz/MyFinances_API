import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { BudgetsService } from './budgets.service';
import {
  BudgetMonthQueryDto,
  BudgetMonthQuerySchema,
  CreateBudgetDto,
  CreateBudgetSchema,
  UpdateBudgetDto,
  UpdateBudgetSchema,
} from './dtos/budget.dto';

@Controller('budgets')
@UseGuards(AuthTokenGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(BudgetMonthQuerySchema))
    query: BudgetMonthQueryDto,
    @User('sub') userId: string,
  ) {
    return this.budgetsService.list(query.month, userId);
  }

  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(BudgetMonthQuerySchema))
    query: BudgetMonthQueryDto,
    @User('sub') userId: string,
  ) {
    return this.budgetsService.summary(query.month, userId);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBudgetSchema)) dto: CreateBudgetDto,
    @User('sub') userId: string,
  ) {
    return this.budgetsService.create(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBudgetSchema)) dto: UpdateBudgetDto,
    @User('sub') userId: string,
  ) {
    return this.budgetsService.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @User('sub') userId: string) {
    return this.budgetsService.remove(id, userId);
  }
}
