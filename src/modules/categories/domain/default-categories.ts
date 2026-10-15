import { TransactionType } from '@prisma/client';
import { INCOME_CATEGORIES } from 'src/common/constants/categories.constants';

export type CategoryView = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  archived: boolean;
  isDefault: boolean;
};

const entries = [
  ['FOOD', 'Alimentação', 'Utensils'],
  ['TRANSPORT', 'Transporte', 'Car'],
  ['ENTERTAINMENT', 'Entretenimento', 'Film'],
  ['UTILITIES', 'Contas', 'Receipt'],
  ['SALARY', 'Salário', 'Briefcase'],
  ['HEALTH', 'Saúde', 'Heart'],
  ['EDUCATION', 'Educação', 'GraduationCap'],
  ['SHOPPING', 'Compras', 'ShoppingBag'],
  ['SUBSCRIPTIONS', 'Assinaturas', 'CreditCard'],
  ['HOUSING', 'Moradia', 'Home'],
  ['TRAVEL', 'Viagens', 'Plane'],
  ['PETS', 'Pets', 'Dog'],
  ['TAXES', 'Impostos', 'Landmark'],
  ['INSURANCE', 'Seguros', 'Shield'],
  ['PERSONAL_CARE', 'Cuidados Pessoais', 'Scissors'],
  ['DEBT_PAYMENT', 'Dívidas', 'HandCoins'],
  ['FREELANCE', 'Freelance', 'Briefcase'],
  ['INVESTMENTS', 'Investimentos', 'TrendingUp'],
  ['GIFTS_RECEIVED', 'Presentes', 'Gift'],
  ['REFUNDS', 'Reembolsos', 'CircleDollarSign'],
  ['OTHER', 'Outros', 'CircleHelp'],
  ['OTHER_INCOME', 'Outros', 'CircleDollarSign'],
] as const;

export const DEFAULT_CATEGORIES: CategoryView[] = entries.map(
  ([id, name, icon]) => ({
    id,
    name,
    icon,
    color: '#2563eb',
    archived: false,
    isDefault: true,
    type: (INCOME_CATEGORIES as readonly string[]).includes(id)
      ? 'INCOME'
      : 'EXPENSE',
  }),
);
