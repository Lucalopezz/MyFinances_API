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
import { TransactionsService } from './transactions.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dtos/transaction.dto';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('transactions')
@UseGuards(AuthTokenGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async createTransaction(
    @Body(new ZodValidationPipe(CreateTransactionDto))
    dto: CreateTransactionDto,
    @User('sub') userId: string,
  ) {
    return this.transactionsService.createTransaction(dto, userId);
  }

  @Get()
  async getTransactions(@User('sub') userId: string) {
    return this.transactionsService.getTransactions(userId);
  }

  @Get(':id')
  async getTransaction(@Param('id') id: string, @User('sub') userId: string) {
    return this.transactionsService.getTransaction(id, userId);
  }

  @Patch(':id')
  async updateTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTransactionDto))
    updateTransactionDto: UpdateTransactionDto,
    @User('sub') userId: string,
  ) {
    return this.transactionsService.updateTransaction(
      id,
      updateTransactionDto,
      userId,
    );
  }

  @Delete(':id')
  async deleteTransaction(
    @Param('id') id: string,
    @User('sub') userId: string,
  ) {
    return this.transactionsService.deleteTransaction(id, userId);
  }
}
