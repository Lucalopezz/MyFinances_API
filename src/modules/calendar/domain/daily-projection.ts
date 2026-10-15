import { nextDay } from 'src/common/date/civil-date';
import { toCents, fromCents } from 'src/common/money/money';
import { CalendarEvent, RealizedMovement } from '../types/calendar.types';

/** Soma realizado e previsto em centavos; pendências anteriores entram apenas no primeiro dia. */
export function dailyProjection(
  start: string,
  end: string,
  events: CalendarEvent[],
  actual: RealizedMovement[],
) {
  const signed = (v: number, type: string) =>
    toCents(v) * (type === 'INCOME' ? 1 : -1);
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
      .reduce((n, e) => n + toCents(e.amount), 0);
    const expense = items
      .filter((e) => e.type === 'EXPENSE')
      .reduce((n, e) => n + toCents(e.amount), 0);
    const realized = actual
      .filter((t) => t.date === date)
      .reduce((n, t) => n + signed(t.value, t.type), 0);
    balance += income - expense + realized;
    days.push({
      date,
      balance: fromCents(balance),
      income: fromCents(income),
      expense: fromCents(expense),
      realized: fromCents(realized),
    });
  }
  return {
    start,
    end,
    baseBalance: fromCents(base),
    overdueImpact: fromCents(
      overdue.reduce((n, e) => n + signed(e.amount, e.type), 0),
    ),
    projectedBalance: fromCents(balance),
    firstNegativeDate: days.find((d) => d.balance < 0)?.date ?? null,
    days,
  };
}
