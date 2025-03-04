import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from './dtos/fixed-expense.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('fixed-expenses')
@UseGuards(AuthTokenGuard)
export class FixedExpensesController {
  constructor(private readonly fixedExpensesService: FixedExpensesService) {}

  @Post()
  async createFixedExpense(
    @Body(new ZodValidationPipe(CreateFixedExpenseDto))
    createFixedExpenseDto: CreateFixedExpenseDto,
    @User('sub') userId: string,
  ) {
    return this.fixedExpensesService.createFixedExpense(
      createFixedExpenseDto,
      userId,
    );
  }

  @Get()
  async getFixedExpenses(@User('sub') userId: string) {
    return this.fixedExpensesService.getFixedExpenses(userId);
  }

  @Get(':id')
  async getFixedExpense(@Param('id') id: string, @User('sub') userId: string) {
    return this.fixedExpensesService.getFixedExpense(id, userId);
  }

  @Patch(':id')
  async updateFixedExpense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFixedExpenseDto))
    updateFixedExpenseDto: UpdateFixedExpenseDto,
    @User('sub') userId: string,
  ) {
    return this.fixedExpensesService.updateFixedExpense(
      id,
      updateFixedExpenseDto,
      userId,
    );
  }

  // Exclui uma despesa fixa
  @Delete(':id')
  async deleteFixedExpense(
    @Param('id') id: string,
    @User('sub') userId: string,
  ) {
    return this.fixedExpensesService.deleteFixedExpense(id, userId);
  }
}
