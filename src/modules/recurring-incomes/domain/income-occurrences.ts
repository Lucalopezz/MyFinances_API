import { dayKey } from 'src/common/date/civil-date';
import { dueInMonth } from 'src/common/date/recurrence';
import {
  IncomeOccurrence,
  IncomeRevision,
} from '../types/recurring-income.types';

/** Deriva ocorrências sem gravar dados, respeitando vigência, pausa e dia original. */
export function incomeEvents(
  id: string,
  revisions: IncomeRevision[],
  end: string,
  today: string,
): IncomeOccurrence[] {
  const events: IncomeOccurrence[] = [];
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
