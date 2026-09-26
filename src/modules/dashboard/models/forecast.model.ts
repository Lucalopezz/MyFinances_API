export interface ForecastExpenseModel {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
}

export interface ForecastModel {
  month: string;
  currentBalance: number;
  pendingFixedExpenses: number;
  projectedBalance: number;
  expenses: ForecastExpenseModel[];
}
