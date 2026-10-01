import { CreateFixedExpenseDto } from './fixed-expense.dto';

describe('fixed expense due dates', () => {
  afterEach(() => jest.useRealTimers());

  it('checks the current day for each request, including after midnight', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T15:00:00.000Z'));
    const input = {
      name: 'Internet',
      amount: 100,
      category: 'UTILITIES',
      recurrence: 'MONTHLY',
      dueDate: '2026-10-01',
    };

    expect(CreateFixedExpenseDto.safeParse(input).success).toBe(true);
    jest.setSystemTime(new Date('2026-10-02T15:00:00.000Z'));
    expect(CreateFixedExpenseDto.safeParse(input).success).toBe(false);
  });
});
