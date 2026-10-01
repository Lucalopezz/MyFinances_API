import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
} from './transaction.dto';

describe('transaction dates', () => {
  it('rejects invalid dates before they reach encryption and the database', () => {
    const input = {
      type: 'EXPENSE',
      value: 25,
      date: 'not-a-date',
      category: 'FOOD',
    };

    expect(CreateTransactionSchema.safeParse(input).success).toBe(false);
    expect(UpdateTransactionSchema.safeParse(input).success).toBe(false);
  });

  it('keeps valid ISO dates as Date objects', () => {
    const result = CreateTransactionSchema.parse({
      type: 'INCOME',
      value: 100,
      date: '2026-10-01T00:00:00.000Z',
      category: 'SALARY',
    });

    expect(result.date).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });
});
