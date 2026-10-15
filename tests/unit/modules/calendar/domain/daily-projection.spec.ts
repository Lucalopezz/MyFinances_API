import { dailyProjection } from 'src/modules/calendar/domain/daily-projection';
import { incomeEvents } from 'src/modules/recurring-incomes/domain/income-occurrences';

const revision = {
  description: 'Salário',
  amount: 1000,
  category: 'SALARY',
  startDate: '2024-01-31',
  effectiveFrom: '2024-01-31',
  recurrence: 'MONTHLY' as const,
  paused: false,
};
describe('Projeção diária do calendário', () => {
  it('inclui atrasados uma vez e realizados na data real sem repetir a previsão', () => {
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
  it('preserva a precisão de centavos', () => {
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
  });
});
