// Estrutura de domínio retornada pela API. Os gastos são calculados separadamente a cada leitura.
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
