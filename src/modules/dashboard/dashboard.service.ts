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

type MonthlyComparisonMonth = {
  month: string;
  totalExpenses: number;
  totalIncomes: number;
  balance: number;
  economyRate: number;
  percentageChange?: number;
};

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
    const economyRate = totalIncomes > 0 ? (balance / totalIncomes) * 100 : 0;

    return {
      balance,
      totalIncomes,
      totalExpenses,
      economyRate: parseFloat(economyRate.toFixed(2)),
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }

  async getMonthlyComparison(
    query: DashboardQueryDto,
    userId: string,
  ): Promise<MonthlyComparisonDto> {
    const { startDate, endDate } = query;

    const transactions = await this.findTransactionsByPeriod(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
    const monthlyData = this.groupTransactionsByMonth(transactions);

    const months = Object.keys(monthlyData)
      .sort()
      .map((month, index, monthKeys): MonthlyComparisonMonth => {
        const currentMonth = monthlyData[month];
        const previousMonth = monthlyData[monthKeys[index - 1]];
        const balance = currentMonth.totalIncomes - currentMonth.totalExpenses;
        const percentageChange = previousMonth
          ? this.calculatePercentageChange(currentMonth, previousMonth)
          : 0;
        const economyRate =
          currentMonth.totalIncomes > 0
            ? (balance / currentMonth.totalIncomes) * 100
            : 0;

        return {
          month,
          totalExpenses: currentMonth.totalExpenses,
          totalIncomes: currentMonth.totalIncomes,
          balance,
          economyRate: parseFloat(economyRate.toFixed(2)),
          percentageChange:
            index > 0 ? parseFloat(percentageChange.toFixed(2)) : undefined,
        };
      });

    const bestMonth = this.findMonthByEconomyRate(months, 'best');
    const worstMonth = this.findMonthByEconomyRate(months, 'worst');

    return {
      months,
      bestMonth,
      worstMonth,
    };
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

    if (totalPrevious === 0) {
      return 0;
    }

    return ((totalCurrent - totalPrevious) / totalPrevious) * 100;
  }

  private findMonthByEconomyRate(
    months: MonthlyComparisonMonth[],
    type: 'best' | 'worst',
  ): Pick<MonthlyComparisonMonth, 'month' | 'balance' | 'economyRate'> | null {
    if (!months.length) {
      return null;
    }

    const selectedMonth = months.reduce((selected, month) => {
      if (type === 'best') {
        // Se o mês atual tiver uma taxa de economia maior que a selecionada, ele se torna o novo selecionado
        return month.economyRate > selected.economyRate ? month : selected;
      }

      return month.economyRate < selected.economyRate ? month : selected;
    });

    return {
      month: selectedMonth.month,
      balance: selectedMonth.balance,
      economyRate: selectedMonth.economyRate,
    };
  }
}
