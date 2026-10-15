import { dueInMonth } from 'src/common/date/recurrence';
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
describe('Ocorrências de receitas recorrentes', () => {
  it('ajusta o vencimento em meses curtos e recupera o dia original', () => {
    expect(dueInMonth('2024-01-31', '2024-02', 'MONTHLY')).toBe('2024-02-29');
    expect(dueInMonth('2025-01-31', '2025-02', 'MONTHLY')).toBe('2025-02-28');
    expect(dueInMonth('2025-01-31', '2025-03', 'MONTHLY')).toBe('2025-03-31');
    expect(dueInMonth('2024-02-29', '2025-02', 'YEARLY')).toBe('2025-02-28');
    expect(dueInMonth('2024-02-29', '2025-03', 'YEARLY')).toBeNull();
  });
  it('preserva o histórico e retoma sem recriar competências pausadas', () => {
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
});
