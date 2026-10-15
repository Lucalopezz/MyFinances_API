/** Contratos internos de receitas; a validação HTTP fica restrita aos DTOs. */
export type IncomeInput = {
  description: string;
  amount: number;
  category: string;
  startDate: string;
  recurrence: 'MONTHLY' | 'YEARLY';
  paused: boolean;
};

export type IncomeRevision = IncomeInput & { effectiveFrom: string };
export type UpdateIncomeInput = Partial<IncomeInput> & { revision: number };
export type IncomeConfirmation = { amount: number; date: string };

/** Snapshot usado tanto pela previsão quanto pelo recibo durável realizado. */
export type IncomeOccurrence = {
  id: string;
  sourceId: string;
  dueDate: string;
  periodKey: string;
  description: string;
  amount: number;
  category: string;
  type: 'INCOME';
  status: 'PENDING' | 'OVERDUE' | 'SETTLED';
  actualDate?: string;
  actualAmount?: number;
  transactionId?: string;
};
