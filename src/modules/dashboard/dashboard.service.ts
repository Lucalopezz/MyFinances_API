import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardQueryDto } from './dtos/dashboard.dto';
import { MonthlyComparisonDto } from './dtos/monthly-comparison.dto';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async getDashboardData(query: DashboardQueryDto, userId: string) {
    const { startDate, endDate } = query;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
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

  async getMonthlyComparison(
    query: DashboardQueryDto,
    userId: string,
  ): Promise<MonthlyComparisonDto[]> {
    const { startDate, endDate } = query;

    // busca todas as transações no período especificado
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    //  agrupaa transações por mês
    const monthlyData = transactions.reduce((acc, transaction) => {
      const month = transaction.date.toISOString().slice(0, 7); // extrai o ano e o mês (ex: "2025-02")
      if (!acc[month]) {
        acc[month] = {
          totalExpenses: 0,
          totalIncomes: 0,
        };
      }

      if (transaction.type === 'EXPENSE') {
        acc[month].totalExpenses += transaction.value;
      } else if (transaction.type === 'INCOME') {
        acc[month].totalIncomes += transaction.value;
      }

      return acc;
    }, {});

    // calcula a mudança percentual em relação ao mês anterior
    const result = Object.keys(monthlyData).map((month, index, months) => {
      const currentMonth = monthlyData[month];
      const previousMonth = monthlyData[months[index - 1]];

      let percentageChange = 0;
      if (previousMonth) {
        const totalPrevious =
          previousMonth.totalIncomes - previousMonth.totalExpenses;
        const totalCurrent =
          currentMonth.totalIncomes - currentMonth.totalExpenses;
        percentageChange =
          ((totalCurrent - totalPrevious) / totalPrevious) * 100;
      }

      return {
        month,
        totalExpenses: currentMonth.totalExpenses,
        totalIncomes: currentMonth.totalIncomes,
        percentageChange:
          index > 0 ? parseFloat(percentageChange.toFixed(2)) : undefined,
      };
    });

    return result;
  }
}
