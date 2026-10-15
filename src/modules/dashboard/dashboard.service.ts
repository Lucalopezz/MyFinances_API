import { DashboardMetrics } from './domain/dashboard-metrics';
import { Injectable } from '@nestjs/common';
import { DashboardQueryDto } from './dto/dashboard.dto';
import { MonthlyComparisonDto } from './dto/monthly-comparison.dto';
import { CalendarService } from '../calendar/services/calendar.service';
import { todayKey } from 'src/common/date/civil-date';
import { DecryptedTransaction } from '../transactions/mappers/transaction-encryption.mapper';
import { TransactionQueriesService } from '../transactions/services/transaction-queries.service';
import { ForecastModel } from './models/forecast.model';

@Injectable()
export class DashboardService {
  constructor(
    private readonly transactionsQuery: TransactionQueriesService,
    private readonly calendar: CalendarService,
    private readonly metrics: DashboardMetrics,
  ) {}

  /** Reutiliza a agenda para que cartões e recorrências tenham a mesma previsão em todas as telas. */
  async getForecast(userId: string): Promise<ForecastModel> {
    const today = todayKey();
    const month = today.slice(0, 7);
    const agenda = await this.calendar.calendar(userId, month);
    // Vencimentos deste mês anteriores a hoje aparecem nas duas listas da
    // agenda. A identidade do evento impede repetir a pendência nos totais.
    const pendingEvents = new Map(
      [...agenda.overdue, ...agenda.events].map((event) => [event.id, event]),
    );
    const expenses = [...pendingEvents.values()]
      .filter((event) => event.type === 'EXPENSE' && event.status !== 'SETTLED')
      .map((event) => ({
        id: event.id,
        name: event.description,
        amount: event.amount,
        dueDate: new Date(`${event.dueDate}T12:00:00Z`),
      }));
    const sum = (items: typeof expenses) =>
      items.reduce((total, item) => total + Math.round(item.amount * 100), 0) /
      100;
    // O saldo-base já contém todo o realizado antes de hoje. Somamos apenas
    // as movimentações reais de hoje, em centavos, sem previsões ou dias futuros.
    const realizedToday =
      agenda.projection.days.find((day) => day.date === today)?.realized ?? 0;
    return {
      month,
      currentBalance:
        (Math.round(agenda.projection.baseBalance * 100) +
          Math.round(realizedToday * 100)) /
        100,
      pendingFixedExpenses: sum(
        expenses.filter((item) => !item.id.startsWith('card:')),
      ),
      pendingCardInvoices: sum(
        expenses.filter((item) => item.id.startsWith('card:')),
      ),
      projectedBalance: agenda.projection.projectedBalance,
      expenses,
    };
  }

  async getDashboardData(query: DashboardQueryDto, userId: string) {
    const { startDate, endDate } = query;
    const transactions = await this.findTransactionsByPeriod(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
    const { totalIncomes, totalExpenses } =
      this.metrics.calculateTotals(transactions);
    const balance = totalIncomes - totalExpenses;
    const economyRate = totalIncomes > 0 ? (balance / totalIncomes) * 100 : 0;

    const expensesByCategory = transactions
      .filter((transaction) => transaction.type === 'EXPENSE')
      .reduce(
        (acc, transaction) => {
          acc[transaction.category] =
            (acc[transaction.category] || 0) + transaction.value;
          return acc;
        },
        {} as Record<string, number>,
      );

    const highestSpendingCategory = Object.entries(expensesByCategory).reduce(
      (highest, [category, total]) => {
        if (total === undefined) return highest;

        if (!highest || total > highest.total) {
          return {
            category: category as string,
            total,
          };
        }

        return highest;
      },
      null as { category: string; total: number } | null,
    );

    return {
      balance,
      totalIncomes,
      totalExpenses,
      economyRate: parseFloat(economyRate.toFixed(2)),
      highestSpendingCategory,
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
    const monthlyData = this.metrics.groupTransactionsByMonth(transactions);

    const months = Object.keys(monthlyData)
      .sort()
      .map((month, index, monthKeys) => {
        const currentMonth = monthlyData[month];
        const previousMonth = monthlyData[monthKeys[index - 1]];
        const balance = currentMonth.totalIncomes - currentMonth.totalExpenses;
        const percentageChange = previousMonth
          ? this.metrics.calculatePercentageChange(currentMonth, previousMonth)
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

    const bestMonth = this.metrics.findMonthByEconomyRate(months, 'best');
    const worstMonth = this.metrics.findMonthByEconomyRate(months, 'worst');

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
  ): Promise<DecryptedTransaction[]> {
    return this.transactionsQuery.findByPeriod(userId, startDate, endDate);
  }
}
