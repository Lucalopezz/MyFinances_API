import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async createTransaction(
    @Body(new ZodValidationPipe(CreateTransactionDto))
    dto: CreateTransactionDto,
  ) {
    return this.transactionsService.createTransaction(dto);
  }

  @Get()
  async getTransactions() {
    return this.transactionsService.getTransactions();
  }

  @Get(':id')
  async getTransaction(@Param('id') id: string) {
    return this.transactionsService.getTransaction(id);
  }

  @Patch(':id')
  async updateTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTransactionDto))
    updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionsService.updateTransaction(id, updateTransactionDto);
  }

  @Delete(':id')
  async deleteTransaction(@Param('id') id: string) {
    return this.transactionsService.deleteTransaction(id);
  }
}
