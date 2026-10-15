import { dayKey } from 'src/common/date/civil-date';

interface NotificationExpense {
  name: string;
  amount: number;
  isPaid: boolean;
  dueDate: Date;
}

type NotificationEvent = 'UPCOMING' | 'OVERDUE';

export const NOTIFICATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 86400000;

/** Usa dias civis: vencimentos são datas UTC e hoje é o dia financeiro de São Paulo. */
export function expenseNotification(
  expense: NotificationExpense,
  today: string,
) {
  if (expense.isPaid) return null;
  const dueDateKey = dayKey(expense.dueDate);
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

/** Resolve o evento anterior sem apagar o histórico nem inferir identidade pelo texto. */
export function notificationResolution(
  expense: { isPaid: boolean; dueDate: Date } | undefined,
  notification: { dueDateKey: string | null; event: string | null },
  today: string,
) {
  if (!expense) return 'EXPENSE_DELETED';
  if (expense.isPaid) return 'PAID';
  const due = dayKey(expense.dueDate);
  if (due !== notification.dueDateKey) return 'DUE_DATE_CHANGED';
  if (notification.event === 'UPCOMING' && due < today) return 'SUPERSEDED';
  return null;
}

/** Um lembrete antigo gera recibo sem novo aviso, preservando a deduplicação legada. */
export function legacyNotificationDelivered(
  event: NotificationEvent,
  due: string,
  lastDue: Date | null,
) {
  return event === 'UPCOMING' && !!lastDue && dayKey(lastDue) === due;
}
