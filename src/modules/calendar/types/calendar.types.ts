/** Contrato interno da agenda; nenhuma regra depende dos DTOs HTTP. */
export type CalendarEvent = {
  id: string;
  sourceId: string;
  dueDate: string;
  description: string;
  amount: number;
  category: string;
  type: 'INCOME' | 'EXPENSE';
  status: 'PENDING' | 'OVERDUE' | 'SETTLED';
  periodKey?: string;
  actualDate?: string;
  actualAmount?: number;
  transactionId?: string;
};

/** Apenas os campos necessários para compor previsões são expostos ao domínio. */
export type CalendarExpense = {
  id: string;
  dueDate: Date;
  recurrence: string;
  recurrenceDay?: number | null;
  cardId?: string | null;
  cardInstallments?: number | null;
  isPaid: boolean;
  name: string;
  amount: number;
  category: string;
  paidTransactionId?: string | null;
  paidAt?: Date | null;
};

export type CalendarCard = {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  invoices: {
    cycle: string;
    dueDate: string;
    total: number;
    paid: boolean;
    paymentDate?: string | null;
  }[];
};

export type CalendarReceiptSnapshot = {
  sourceId: string;
  periodKey: string;
  event: CalendarEvent;
};

export type RealizedMovement = { date: string; value: number; type: string };
