import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from './dtos/fixed-expense.dto';
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

  @Get(':id')
  async getFixedExpense(@Param('id') id: string) {
    return this.fixedExpensesService.getFixedExpense(id);
  }

  @Patch(':id')
  async updateFixedExpense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFixedExpenseDto))
    updateFixedExpenseDto: UpdateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.updateFixedExpense(
      id,
      updateFixedExpenseDto,
    );
  }

  // Exclui uma despesa fixa
  @Delete(':id')
  async deleteFixedExpense(@Param('id') id: string) {
    return this.fixedExpensesService.deleteFixedExpense(id);
  }
}
