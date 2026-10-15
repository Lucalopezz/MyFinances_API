import { reviseIncome } from 'src/modules/recurring-incomes/domain/income-revisions';
import { IncomeRevision } from 'src/modules/recurring-incomes/types/recurring-income.types';

describe('Revisões de receitas recorrentes', () => {
  const original: IncomeRevision = {
    description: 'Salário',
    amount: 1000,
    category: 'SALARY',
    startDate: '2025-01-31',
    recurrence: 'MONTHLY',
    paused: false,
    effectiveFrom: '2025-01-31',
  };

  it('aplica alterações amanhã sem modificar o histórico ou o objeto original', () => {
    const result = reviseIncome([original], { amount: 1200 }, '2026-12-31');
    expect(result.revisions).toEqual([
      original,
      { ...original, amount: 1200, effectiveFrom: '2027-01-01' },
    ]);
    expect(original.amount).toBe(1000);
    expect(result.next.category).toBe('SALARY');
  });

  it('mescla edições do mesmo dia substituindo só a revisão futura', () => {
    const first = reviseIncome([original], { amount: 1200 }, '2026-10-15');
    const second = reviseIncome(
      first.revisions,
      { description: 'Novo salário' },
      '2026-10-15',
    );
    expect(second.revisions).toHaveLength(2);
    expect(second.revisions[0]).toEqual(original);
    expect(second.next).toMatchObject({
      amount: 1200,
      description: 'Novo salário',
      effectiveFrom: '2026-10-16',
    });
  });

  it('preserva períodos pausados ao retomar a recorrência', () => {
    const paused = { ...original, paused: true, effectiveFrom: '2026-09-01' };
    const result = reviseIncome(
      [original, paused],
      { paused: false },
      '2026-10-15',
    );
    expect(result.revisions).toEqual([
      original,
      paused,
      { ...original, effectiveFrom: '2026-10-16' },
    ]);
  });
});
