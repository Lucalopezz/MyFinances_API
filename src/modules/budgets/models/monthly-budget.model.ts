// Domain shape returned by the API. Spending is computed separately on each read.
export interface MonthlyBudgetModel {
  id: string;
  userId: string;
  monthKey: string;
  category: string;
  limitAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MonthlyBudgetSummaryModel = MonthlyBudgetModel & {
  spentAmount: number;
  remainingAmount: number;
};
