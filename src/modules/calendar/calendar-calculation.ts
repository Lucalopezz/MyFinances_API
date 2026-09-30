import { CalendarEvent, IncomeRevision } from './calendar.dto';
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
export function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function nextDay(day: string) {
  return dayKey(new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000));
}
export function dueInMonth(
  start: string,
  month: string,
  recurrence: string,
  anchorDay = Number(start.slice(8)),
): string | null {
  if (
    month < start.slice(0, 7) ||
    (recurrence === 'YEARLY' && month.slice(5) !== start.slice(5, 7))
  )
    return null;
  const [y, m] = month.split('-').map(Number);
  const day = Math.min(anchorDay, new Date(Date.UTC(y, m, 0)).getUTCDate());
  return `${month}-${String(day).padStart(2, '0')}`;
}
export function incomeEvents(
  id: string,
  revisions: IncomeRevision[],
  end: string,
  today: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const earliest = revisions.reduce(
    (min, v) => (v.startDate < min ? v.startDate : min),
    revisions[0].startDate,
  );
  let month = earliest.slice(0, 7);
  while (month <= end.slice(0, 7)) {
    for (let i = 0; i < revisions.length; i++) {
      const v = revisions[i];
      const date = dueInMonth(v.startDate, month, v.recurrence);
      if (
        !date ||
        date > end ||
        date < v.effectiveFrom ||
        (revisions[i + 1] && date >= revisions[i + 1].effectiveFrom) ||
        v.paused
      )
        continue;
      events.push({
        id: `${id}:${date}`,
        sourceId: id,
        dueDate: date,
        description: v.description,
        amount: v.amount,
        category: v.category,
        periodKey: `${v.recurrence}:${date.slice(0, v.recurrence === 'MONTHLY' ? 7 : 4)}`,
        type: 'INCOME',
        status: date < today ? 'OVERDUE' : 'PENDING',
      });
    }
    const [y, m] = month.split('-').map(Number);
    month = dayKey(new Date(Date.UTC(y, m, 1))).slice(0, 7);
  }
  return events;
}
export function dailyProjection(
  start: string,
  end: string,
  events: CalendarEvent[],
  actual: { date: string; value: number; type: string }[],
) {
  const cents = (v: number) => Math.round(v * 100);
  const signed = (v: number, type: string) =>
    cents(v) * (type === 'INCOME' ? 1 : -1);
  const base = actual
    .filter((t) => t.date < start)
    .reduce((n, t) => n + signed(t.value, t.type), 0);
  const pending = events.filter((e) => e.status !== 'SETTLED');
  const overdue = pending.filter((e) => e.dueDate < start);
  let balance =
    base + overdue.reduce((n, e) => n + signed(e.amount, e.type), 0);
  const days: {
    date: string;
    balance: number;
    income: number;
    expense: number;
    realized: number;
  }[] = [];
  for (let date = start; date <= end; date = nextDay(date)) {
    const items = pending.filter((e) => e.dueDate === date);
    const income = items
      .filter((e) => e.type === 'INCOME')
      .reduce((n, e) => n + cents(e.amount), 0);
    const expense = items
      .filter((e) => e.type === 'EXPENSE')
      .reduce((n, e) => n + cents(e.amount), 0);
    const realized = actual
      .filter((t) => t.date === date)
      .reduce((n, t) => n + signed(t.value, t.type), 0);
    balance += income - expense + realized;
    days.push({
      date,
      balance: balance / 100,
      income: income / 100,
      expense: expense / 100,
      realized: realized / 100,
    });
  }
  return {
    start,
    end,
    baseBalance: base / 100,
    overdueImpact:
      overdue.reduce((n, e) => n + signed(e.amount, e.type), 0) / 100,
    projectedBalance: balance / 100,
    firstNegativeDate: days.find((d) => d.balance < 0)?.date ?? null,
    days,
  };
}
