import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  TransactionSummarySchema,
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

describe('transaction summary period', () => {
  it('requires real calendar dates and an ordered period', () => {
    expect(TransactionSummarySchema.safeParse({}).success).toBe(false);
    expect(
      TransactionSummarySchema.safeParse({
        startDate: '2026-02-30',
        endDate: '2026-03-01',
      }).success,
    ).toBe(false);
    expect(
      TransactionSummarySchema.safeParse({
        startDate: '2026-03-01',
        endDate: '2026-02-28',
      }).success,
    ).toBe(false);
    expect(
      TransactionSummarySchema.parse({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      }),
    ).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });
  });
});
