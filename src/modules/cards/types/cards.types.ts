/** Dados internos em centavos; o domínio não recebe registros Prisma ou DTOs HTTP. */
export type CardTerms = {
  name: string;
  limitCents: number;
  annualFeeCents: number;
  feeFirstCycle: string;
};

export type PurchaseTerms = {
  description: string;
  amountCents: number;
  category: string;
  installments: number;
};

export type Card = CardTerms & {
  id: string;
  closingDay: number;
  dueDay: number;
  archivedAt: Date | null;
  revision: number;
};

export type Purchase = PurchaseTerms & {
  id: string;
  purchaseDate: string;
  refundedAt: Date | null;
  fixedExpenseId: string | null;
  fixedExpenseDueDate: Date | null;
};

export type Installment = {
  id: string;
  purchaseId: string;
  cycle: string;
  number: number;
  amountCents: number;
};

export type Payment = {
  cycle: string;
  date: string;
  amountCents: number;
  transactionIds: string[];
};

export type CardSnapshot = {
  card: Card;
  purchases: Purchase[];
  installments: Installment[];
  payments: Payment[];
};

export type NewCard = {
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  annualFee: number;
};

export type NewPurchase = {
  description: string;
  amount: number;
  date: string;
  category: string;
  installments: number;
};

export type ScheduledInstallment = {
  amount: number;
  cycle: string;
  dueDate: string;
};

export type SettlementItem = {
  amountCents: number;
  category: string;
  description: string;
};
