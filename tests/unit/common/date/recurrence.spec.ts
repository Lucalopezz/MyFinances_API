import { dueInMonth } from 'src/common/date/recurrence';
import { nextDay, todayKey } from 'src/common/date/civil-date';
import { nextExpenseDueDate } from 'src/modules/fixed-expenses/domain/expense-recurrence';

describe('Datas civis e recorrências', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['2024-02', '2024-02-29'],
    ['2025-02', '2025-02-28'],
    ['2025-04', '2025-04-30'],
    ['2025-05', '2025-05-31'],
  ])('mantém a âncora 31 na competência %s', (month, expected) => {
    expect(dueInMonth('2024-01-31', month, 'MONTHLY')).toBe(expected);
  });

  it('não prevê antes do início nem em outro mês de uma recorrência anual', () => {
    expect(dueInMonth('2025-03-10', '2025-02', 'MONTHLY')).toBeNull();
    expect(dueInMonth('2024-02-29', '2025-03', 'YEARLY')).toBeNull();
    expect(dueInMonth('2024-02-29', '2025-02', 'YEARLY')).toBe('2025-02-28');
  });

  it('recupera o dia original após fevereiro sem saltar competências vencidas', () => {
    const february = nextExpenseDueDate(
      new Date('2025-01-31T12:00:00Z'),
      'MONTHLY',
      31,
    );
    expect(february.toISOString()).toBe('2025-02-28T12:00:00.000Z');
    expect(nextExpenseDueDate(february, 'MONTHLY', 31).toISOString()).toBe(
      '2025-03-31T12:00:00.000Z',
    );
  });

  it('renova despesas anuais bissextas sem avançar para março', () => {
    expect(
      nextExpenseDueDate(
        new Date('2024-02-29T12:00:00Z'),
        'YEARLY',
        29,
      ).toISOString(),
    ).toBe('2025-02-28T12:00:00.000Z');
  });

  it.each([
    ['2024-02-28', '2024-02-29'],
    ['2024-02-29', '2024-03-01'],
    ['2025-12-31', '2026-01-01'],
  ])('avança um dia civil de %s para %s', (day, expected) => {
    expect(nextDay(day)).toBe(expected);
  });

  it('considera o dia em São Paulo quando UTC já virou o mês', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T02:59:59Z'));
    expect(todayKey()).toBe('2026-02-28');
    jest.setSystemTime(new Date('2026-03-01T03:00:00Z'));
    expect(todayKey()).toBe('2026-03-01');
  });
});
