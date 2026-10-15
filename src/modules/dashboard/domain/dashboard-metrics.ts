import type { DecryptedTransaction } from '../../transactions/types/transaction.types';

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

/** Calcula indicadores sobre transações já lidas, sem consultar ou alterar o banco. */
export class DashboardMetrics {
  calculateTotals(transactions: DecryptedTransaction[]): TransactionTotals {
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
  groupTransactionsByMonth(transactions: DecryptedTransaction[]): MonthlyData {
    return transactions.reduce((monthlyData, transaction) => {
      const month = transaction.date.toISOString().slice(0, 7);

      if (!monthlyData[month]) {
        monthlyData[month] = { totalExpenses: 0, totalIncomes: 0 };
      }

      this.addTransactionToTotals(monthlyData[month], transaction);
      return monthlyData;
    }, {} as MonthlyData);
  }

  addTransactionToTotals(
    totals: TransactionTotals,
    transaction: DecryptedTransaction,
  ): void {
    if (transaction.type === 'INCOME') {
      totals.totalIncomes += transaction.value;
    }

    if (transaction.type === 'EXPENSE') {
      totals.totalExpenses += transaction.value;
    }
  }

  calculatePercentageChange(
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

  findMonthByEconomyRate(
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
