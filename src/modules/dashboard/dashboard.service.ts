import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardQueryDto } from './dtos/dashboard.dto';
import { MonthlyComparisonDto } from './dtos/monthly-comparison.dto';
import { Transaction, TransactionType } from '@prisma/client';

type TransactionTotals = {
  totalIncomes: number;
  totalExpenses: number;
};

type MonthlyData = Record<string, TransactionTotals>;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(query: DashboardQueryDto, userId: string) {
    const { startDate, endDate } = query;
    const transactions = await this.findTransactionsByPeriod(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
    const { totalIncomes, totalExpenses } = this.calculateTotals(transactions);
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

    const transactions = await this.findTransactionsByPeriod(
      userId,
      startDate,
      endDate,
    );
    const monthlyData = this.groupTransactionsByMonth(transactions);

    return Object.keys(monthlyData).map((month, index, months) => {
      const currentMonth = monthlyData[month];
      const previousMonth = monthlyData[months[index - 1]];
      const percentageChange = previousMonth
        ? this.calculatePercentageChange(currentMonth, previousMonth)
        : 0;

      return {
        month,
        totalExpenses: currentMonth.totalExpenses,
        totalIncomes: currentMonth.totalIncomes,
        percentageChange:
          index > 0 ? parseFloat(percentageChange.toFixed(2)) : undefined,
      };
    });
  }

  private findTransactionsByPeriod(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  private calculateTotals(transactions: Transaction[]): TransactionTotals {
    return transactions.reduce(
      (totals, transaction) => {
        this.addTransactionToTotals(totals, transaction);
        return totals;
      },
      { totalIncomes: 0, totalExpenses: 0 },
    );
  }

  // Agrupa as transações por mês e calcula os totais de despesas e receitas para cada mês
  // Jan 2024: { totalExpenses: 1000, totalIncomes: 2000 }
  // Feb 2024: { totalExpenses: 1500, totalIncomes: 2500 }
  private groupTransactionsByMonth(transactions: Transaction[]): MonthlyData {
    return transactions.reduce((monthlyData, transaction) => {
      const month = transaction.date.toISOString().slice(0, 7);

      if (!monthlyData[month]) {
        monthlyData[month] = { totalExpenses: 0, totalIncomes: 0 };
      }

      this.addTransactionToTotals(monthlyData[month], transaction);
      return monthlyData;
    }, {} as MonthlyData);
  }

  private addTransactionToTotals(
    totals: TransactionTotals,
    transaction: Transaction,
  ): void {
    if (transaction.type === TransactionType.INCOME) {
      totals.totalIncomes += transaction.value;
    }

    if (transaction.type === TransactionType.EXPENSE) {
      totals.totalExpenses += transaction.value;
    }
  }

  private calculatePercentageChange(
    currentMonth: TransactionTotals,
    previousMonth: TransactionTotals,
  ): number {
    const totalPrevious =
      previousMonth.totalIncomes - previousMonth.totalExpenses;
    const totalCurrent = currentMonth.totalIncomes - currentMonth.totalExpenses;

    return ((totalCurrent - totalPrevious) / totalPrevious) * 100;
  }
}
