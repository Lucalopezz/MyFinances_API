import { FixedExpense, NotificationEvent } from '@prisma/client';

export const NOTIFICATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 86400000;

/** Usa dias civis: vencimentos são datas UTC e hoje é o dia financeiro de São Paulo. */
export function expenseNotification(expense: FixedExpense, today: string) {
  if (expense.isPaid) return null;
  const dueDateKey = expense.dueDate.toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(`${dueDateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
  // Inclui o terceiro dia inteiro, independente da hora armazenada no vencimento.
  if (days > 3) return null;
  const event: NotificationEvent = days < 0 ? 'OVERDUE' : 'UPCOMING';
  const timing =
    days < 0
      ? `venceu há ${-days} ${days === -1 ? 'dia' : 'dias'}`
      : days === 0
        ? 'vence hoje'
        : `vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return {
    event,
    dueDateKey,
    title: days < 0 ? 'Despesa Vencida' : 'Despesa Próxima do Vencimento',
    message: `A despesa "${expense.name}" de R$ ${expense.amount.toFixed(2)} ${timing}.`,
    type: days < 0 ? ('ALERT' as const) : ('REMINDER' as const),
  };
}

/** Um novo dia sempre exige avaliação, mesmo antes de completar cinco minutos. */
export function needsNotificationSync(
  state: { lastCheckedAt: Date; dayKey: string } | null,
  now: Date,
  today: string,
  force: boolean,
) {
  return (
    force ||
    !state ||
    state.dayKey !== today ||
    now.getTime() - state.lastCheckedAt.getTime() >=
      NOTIFICATION_SYNC_INTERVAL_MS
  );
}
