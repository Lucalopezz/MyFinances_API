import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBudgetDto, UpdateBudgetDto } from '../dtos/budget.dto';
import { MonthlyBudgetModel } from '../models/monthly-budget.model';

@Injectable()
export class MonthlyBudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByMonth(month: string, userId: string): Promise<MonthlyBudgetModel[]> {
    return this.prisma.monthlyBudget.findMany({
      where: { userId, monthKey: month },
      orderBy: { category: 'asc' },
    });
  }

  findOwned(id: string, userId: string): Promise<MonthlyBudgetModel | null> {
    return this.prisma.monthlyBudget.findFirst({ where: { id, userId } });
  }

  create(dto: CreateBudgetDto, userId: string): Promise<MonthlyBudgetModel> {
    return this.prisma.monthlyBudget.create({
      data: {
        userId,
        monthKey: dto.monthKey,
        category: dto.category,
        limitAmount: dto.limitAmount,
      },
    });
  }

  update(
    id: string,
    dto: UpdateBudgetDto,
    userId: string,
  ): Promise<MonthlyBudgetModel> {
    return this.prisma.monthlyBudget.update({
      where: { id, userId },
      data: dto,
    });
  }

  remove(id: string, userId: string): Promise<MonthlyBudgetModel> {
    return this.prisma.monthlyBudget.delete({ where: { id, userId } });
  }
}
