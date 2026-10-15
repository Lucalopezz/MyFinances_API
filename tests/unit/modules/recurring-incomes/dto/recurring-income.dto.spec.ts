import { dateSchema } from 'src/common/date/civil-date.schema';
import { incomeSchema } from 'src/modules/recurring-incomes/dto/recurring-income.dto';

describe('Contratos de receitas recorrentes', () => {
  it('rejeita datas inexistentes e valores com frações de centavos', () => {
    expect(dateSchema.safeParse('2026-02-31').success).toBe(false);
    expect(
      incomeSchema.safeParse({
        description: 'Salário',
        amount: 1.001,
        category: 'SALARY',
        startDate: '2026-01-01',
        recurrence: 'MONTHLY',
        paused: false,
      }).success,
    ).toBe(false);
  });
});
