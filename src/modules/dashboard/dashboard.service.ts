import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardQueryDto } from './dtos/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async getDashboardData(query: DashboardQueryDto) {
    const { startDate, endDate } = query;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });
    // total de receitas
    const totalIncomes = transactions
      .filter((transaction) => transaction.type === 'INCOME')
      .reduce((sum, transaction) => sum + transaction.value, 0);

    // total de despesas
    const totalExpenses = transactions
      .filter((transaction) => transaction.type === 'EXPENSE')
      .reduce((sum, transaction) => sum + transaction.value, 0);
    // saldo
    const balance = totalIncomes - totalExpenses;

    return {
      balance,
      totalIncomes,
      totalExpenses,
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }
}
