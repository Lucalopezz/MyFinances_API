import { DashboardService } from './dashboard.service';

describe('DashboardService.getForecast', () => {
  it('reuses the calendar projection and separates card invoices from fixed expenses', async () => {
    const userId = '64f000000000000000000001';
    const event = (id: string, amount: number, status = 'PENDING') => ({
      id,
      sourceId: id,
      description: id,
      amount,
      dueDate: '2026-10-20',
      type: 'EXPENSE',
      status,
    });
    const calendar = {
      calendar: jest.fn(async () => ({
        overdue: [event('card:old:2026-09', 50, 'OVERDUE')],
        events: [
          event('rent', 100),
          event('card:new:2026-10', 80),
          event('paid', 200, 'SETTLED'),
        ],
        projection: { baseBalance: 500, projectedBalance: 270 },
      })),
    };
    const service = new DashboardService(
      {} as never,
      { findByPeriod: async () => [] } as never,
      {} as never,
      calendar as never,
    );
    const forecast = await service.getForecast(userId);
    expect(calendar.calendar).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
    expect(forecast).toMatchObject({
      currentBalance: 500,
      pendingFixedExpenses: 100,
      pendingCardInvoices: 130,
      projectedBalance: 270,
    });
    expect(forecast.expenses.map((expense) => expense.id)).toEqual([
      'card:old:2026-09',
      'rent',
      'card:new:2026-10',
    ]);
  });
});
