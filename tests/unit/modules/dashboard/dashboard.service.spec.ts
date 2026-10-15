import { DashboardMetrics } from 'src/modules/dashboard/domain/dashboard-metrics';
import { CalendarRepository } from 'src/modules/calendar/repositories/calendar.repository';
import { CalendarReceiptMapper } from 'src/modules/calendar/mappers/calendar-receipt.mapper';
import { RecurringIncomesService } from 'src/modules/recurring-incomes/services/recurring-incomes.service';
import { RecurringIncomesRepository } from 'src/modules/recurring-incomes/repositories/recurring-incomes.repository';
import { RecurringIncomeEncryptionMapper } from 'src/modules/recurring-incomes/mappers/recurring-income-encryption.mapper';
import { TransactionsRepository } from 'src/modules/transactions/repositories/transactions.repository';
import { TransactionQueriesService } from 'src/modules/transactions/services/transaction-queries.service';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';
import { CalendarService } from 'src/modules/calendar/services/calendar.service';
import { buildEncryptedTransactionData } from 'src/modules/transactions/mappers/transaction-encryption.mapper';

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
        projection: { baseBalance: 500, projectedBalance: 270, days: [] },
      })),
    };
    const service = createDashboardService(
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

  it('conta o histórico, o realizado de hoje e as pendências uma única vez', async () => {
    // O calendário real coloca vencimentos de outubro nas listas de eventos e
    // atrasados. Datas fixas também protegem o saldo de receitas duplicadas.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T15:00:00Z'));
    try {
      const userId = '64f000000000000000000001';
      const encryption = {
        encrypt: (value: unknown) => JSON.stringify(value),
        decrypt: <T>(value: string): T => JSON.parse(value) as T,
      };
      const entries = [
        { date: '2026-09-30', value: 500, type: 'INCOME' as const },
        { date: '2026-10-01', value: 100, type: 'INCOME' as const },
        { date: '2026-10-05', value: 30, type: 'EXPENSE' as const },
        { date: '2026-10-13', value: 20.12, type: 'INCOME' as const },
        { date: '2026-10-13', value: 5.01, type: 'EXPENSE' as const },
        // Realizado futuro afeta a projeção, mas não o saldo acumulado até hoje.
        { date: '2026-10-20', value: 2, type: 'EXPENSE' as const },
      ];
      const records = entries.map((entry, index) => ({
        id: `transaction-${index}`,
        ...buildEncryptedTransactionData(
          {
            ...entry,
            date: new Date(`${entry.date}T12:00:00Z`),
            userId,
            category: 'OTHER',
          },
          encryption as never,
        ),
      }));
      const prisma = {
        recurringIncome: { findMany: async () => [] },
        fixedExpense: {
          findMany: async () => [
            {
              id: 'fixed-expense',
              name: 'Despesa vencida',
              amount: 10,
              category: 'OTHER',
              recurrence: 'YEARLY',
              dueDate: new Date('2026-10-02T12:00:00Z'),
              isPaid: false,
            },
          ],
        },
        calendarReceipt: { findMany: async () => [] },
        transaction: { findMany: async () => records },
      };
      const cards = {
        listCards: async () => [
          {
            id: 'card',
            name: 'Cartão de teste',
            invoices: [
              {
                cycle: '2026-10',
                dueDate: '2026-10-03',
                total: 20,
                paid: false,
              },
            ],
          },
        ],
      };
      const calendar = createCalendarService(
        prisma as never,
        encryption as never,
        {} as never,
        cards as never,
      );
      const service = createDashboardService(
        {} as never,
        {} as never,
        encryption as never,
        calendar,
      );
      const forecast = await service.getForecast(userId);
      expect(forecast).toMatchObject({
        currentBalance: 585.11,
        pendingFixedExpenses: 10,
        pendingCardInvoices: 20,
        projectedBalance: 553.11,
      });
      expect(forecast.expenses.map((expense) => expense.id)).toEqual([
        'fixed-expense:2026-10-02',
        'card:card:2026-10',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('inclui movimentos do primeiro dia do mês sem misturá-los às previsões', async () => {
    // Na virada do mês, o saldo-base contém apenas os meses anteriores.
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T15:00:00Z'));
    try {
      const service = createDashboardService(
        {} as never,
        {} as never,
        {} as never,
        {
          calendar: async () => ({
            overdue: [],
            events: [],
            projection: {
              baseBalance: 100.01,
              projectedBalance: 70.02,
              days: [
                {
                  date: '2026-11-01',
                  realized: -9.99,
                  income: 0,
                  expense: 20,
                },
              ],
            },
          }),
        } as never,
      );
      expect(
        await service.getForecast('64f000000000000000000001'),
      ).toMatchObject({ currentBalance: 90.02, projectedBalance: 70.02 });
    } finally {
      jest.useRealTimers();
    }
  });
});

function createDashboardService(
  _repository: any,
  transactions: any,
  encryption: any,
  calendar: any,
) {
  return new DashboardService(
    new TransactionQueriesService({} as never, transactions, encryption),
    calendar,
    new DashboardMetrics(),
  );
}

function createCalendarService(
  prisma: any,
  encryption: any,
  categories: any,
  cards: any,
) {
  return new CalendarService(
    new CalendarRepository(prisma),
    new CalendarReceiptMapper(encryption),
    new RecurringIncomesService(
      new RecurringIncomesRepository(prisma),
      new RecurringIncomeEncryptionMapper(encryption),
      categories,
    ),
    cards,
    new TransactionQueriesService(
      categories,
      new TransactionsRepository(prisma),
      encryption,
    ),
  );
}
