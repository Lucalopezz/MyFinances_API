export const INCOME_CATEGORIES = [
  'SALARY',
  'FREELANCE',
  'INVESTMENTS',
  'GIFTS_RECEIVED',
  'REFUNDS',
  'OTHER_INCOME',
] as const;

export const EXPENSE_CATEGORIES = [
  'FOOD',
  'TRANSPORT',
  'ENTERTAINMENT',
  'UTILITIES',
  'HEALTH',
  'EDUCATION',
  'SHOPPING',
  'SUBSCRIPTIONS',
  'HOUSING',
  'TRAVEL',
  'PETS',
  'TAXES',
  'INSURANCE',
  'PERSONAL_CARE',
  'DEBT_PAYMENT',
  'OTHER',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type TransactionCategory = IncomeCategory | ExpenseCategory;
