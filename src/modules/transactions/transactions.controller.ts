import { Body, Controller, Post } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { CreateTransactionDto } from './dtos/transaction.dto';

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
}
