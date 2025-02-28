import { Body, Controller, Get, Post } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { CreateFixedExpenseDto } from './dtos/fixed-expense.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(private readonly fixedExpensesService: FixedExpensesService) {}

  @Post()
  async createFixedExpense(
    @Body(new ZodValidationPipe(CreateFixedExpenseDto))
    createFixedExpenseDto: CreateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.createFixedExpense(createFixedExpenseDto);
  }

  @Get()
  async getFixedExpenses() {
    return this.fixedExpensesService.getFixedExpenses();
  }
}
