import {
  dailyProjection,
  dueInMonth,
  incomeEvents,
} from './calendar-calculation';
import { dateSchema, incomeSchema } from './calendar.dto';
const revision = {
  description: 'Salário',
  amount: 1000,
  category: 'SALARY',
  startDate: '2024-01-31',
  effectiveFrom: '2024-01-31',
  recurrence: 'MONTHLY' as const,
  paused: false,
};
describe('financial calendar calculations', () => {
  it('clamps 29/30/31 and recovers the original day after February', () => {
    expect(dueInMonth('2024-01-31', '2024-02', 'MONTHLY')).toBe('2024-02-29');
    expect(dueInMonth('2025-01-31', '2025-02', 'MONTHLY')).toBe('2025-02-28');
    expect(dueInMonth('2025-01-31', '2025-03', 'MONTHLY')).toBe('2025-03-31');
    expect(dueInMonth('2024-02-29', '2025-02', 'YEARLY')).toBe('2025-02-28');
    expect(dueInMonth('2024-02-29', '2025-03', 'YEARLY')).toBeNull();
  });
  it('preserves old occurrences, pauses future dates and resumes without inventing paused months', () => {
    const events = incomeEvents(
      'one',
      [
        revision,
        { ...revision, paused: true, effectiveFrom: '2024-03-01' },
        { ...revision, amount: 1200, effectiveFrom: '2024-05-01' },
      ],
      '2024-06-30',
      '2024-06-01',
    );
    expect(events.map((e) => e.dueDate)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-05-31',
      '2024-06-30',
    ]);
    expect(events.map((e) => e.amount)).toEqual([1000, 1000, 1200, 1200]);
  });
  it('adds overdue only once, realized transactions on actual dates and excludes settled forecasts', () => {
    const events = incomeEvents(
      'one',
      [
        {
          ...revision,
          startDate: '2026-01-01',
          effectiveFrom: '2026-01-01',
          amount: 100,
        },
      ],
      '2026-02-28',
      '2026-02-01',
    );
    const result = dailyProjection(
      '2026-02-01',
      '2026-02-03',
      [
        ...events,
        {
          ...events[0],
          id: 'expense',
          type: 'EXPENSE',
          amount: 400,
          dueDate: '2026-02-02',
        },
        {
          ...events[0],
          id: 'settled',
          status: 'SETTLED',
          amount: 50,
          dueDate: '2026-02-02',
        },
      ],
      [
        { date: '2026-01-30', value: 100, type: 'INCOME' },
        { date: '2026-02-02', value: 50, type: 'INCOME' },
      ],
    );
    expect(result.baseBalance).toBe(100);
    expect(result.overdueImpact).toBe(100);
    expect(result.days.map((d) => d.balance)).toEqual([300, -50, -50]);
    expect(result.firstNegativeDate).toBe('2026-02-02');
  });
  it('keeps cent precision and rejects invalid dates or amounts', () => {
    expect(
      dailyProjection(
        '2026-01-01',
        '2026-01-01',
        [],
        [
          { date: '2026-01-01', value: 0.1, type: 'INCOME' },
          { date: '2026-01-01', value: 0.2, type: 'INCOME' },
        ],
      ).projectedBalance,
    ).toBe(0.3);
    expect(dateSchema.safeParse('2026-02-31').success).toBe(false);
    expect(incomeSchema.safeParse({ ...revision, amount: 1.001 }).success).toBe(
      false,
    );
  });
});
