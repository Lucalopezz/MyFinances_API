import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { decryptTransaction } from '../transactions/transaction-encryption.mapper';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';
import { CreateBudgetDto, UpdateBudgetDto } from './dtos/budget.dto';
import { MonthlyBudgetsRepository } from './repositories/monthly-budgets.repository';
import { MonthlyBudgetSummaryModel } from './models/monthly-budget.model';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly repository: MonthlyBudgetsRepository,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly encryptionService: FinancialDataEncryptionService,
  ) {}

  list(month: string, userId: string) {
    return this.repository.findByMonth(month, userId);
  }

  async create(dto: CreateBudgetDto, userId: string) {
    try {
      return await this.repository.create(dto, userId);
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async update(id: string, dto: UpdateBudgetDto, userId: string) {
    await this.findOwned(id, userId);
    try {
      return await this.repository.update(id, dto, userId);
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    return this.repository.remove(id, userId);
  }

  async summary(
    month: string,
    userId: string,
  ): Promise<MonthlyBudgetSummaryModel[]> {
    const budgets = await this.list(month, userId);
    if (!budgets.length) return [];
    const spent = new Map<string, number>();
    const firstDay = Number(`${month.replace('-', '')}01`);
    const nextMonth = new Date(`${month}-01T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const lastDay = Number(
      new Date(nextMonth.getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', ''),
    );
    let cursorId: string | undefined;

    while (true) {
      const transactions = await this.transactionsRepository.findExpenseBatch(
        userId,
        firstDay,
        lastDay,
        cursorId,
        200,
      );
      if (!transactions.length) break;
      for (const item of transactions) {
        const transaction = decryptTransaction(item, this.encryptionService);
        spent.set(
          transaction.category,
          (spent.get(transaction.category) ?? 0) + transaction.value,
        );
      }
      cursorId = transactions[transactions.length - 1].id;
      if (transactions.length < 200) break;
    }

    return budgets.map((budget) => ({
      ...budget,
      spentAmount: spent.get(budget.category) ?? 0,
      remainingAmount: budget.limitAmount - (spent.get(budget.category) ?? 0),
    }));
  }

  private async findOwned(id: string, userId: string) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new NotFoundException('Orçamento não encontrado.');
    const budget = await this.repository.findOwned(id, userId);
    if (!budget) throw new NotFoundException('Orçamento não encontrado.');
    return budget;
  }

  private handleUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Já existe um orçamento para esta categoria neste mês.',
      );
    }
    throw error;
  }
}
