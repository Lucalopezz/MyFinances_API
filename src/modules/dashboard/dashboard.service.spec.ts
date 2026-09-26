import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './repositories/dashboard.repository';
import { TransactionsRepository } from '../transactions/repositories/transactions.repository';

describe('DashboardService.getForecast', () => {
  it('counts overdue and next-cycle expenses without double-counting paid cycles', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    try {
      const userId = '64f000000000000000000001';
      const makeTransaction = (type: 'INCOME' | 'EXPENSE', value: number) => ({
        id: value.toString(16).padStart(24, '0'),
        userId,
        dateIndex: 20260710,
        type,
        createdAt: new Date(),
        updatedAt: new Date(),
        encryptedData: {
          value: JSON.stringify(value),
          date: JSON.stringify('2026-07-10T00:00:00.000Z'),
          category: JSON.stringify(type === 'INCOME' ? 'SALARY' : 'FOOD'),
          description: JSON.stringify(null),
        },
      });
      const fixedExpenses = [
        {
          id: 'unpaid',
          name: 'Atual',
          amount: 100,
          dueDate: new Date('2026-07-20'),
          isPaid: false,
          recurrence: 'MONTHLY',
        },
        {
          id: 'overdue',
          name: 'Vencida',
          amount: 50,
          dueDate: new Date('2026-06-20'),
          isPaid: false,
          recurrence: 'MONTHLY',
        },
        {
          id: 'next-cycle',
          name: 'Próximo ciclo',
          amount: 30,
          dueDate: new Date('2026-06-20'),
          isPaid: true,
          recurrence: 'MONTHLY',
        },
        {
          id: 'paid',
          name: 'Paga',
          amount: 40,
          dueDate: new Date('2026-07-10'),
          isPaid: true,
          recurrence: 'MONTHLY',
        },
      ];
      const prisma = {
        transaction: {
          findMany: jest.fn(async () => [
            makeTransaction('INCOME', 500),
            makeTransaction('EXPENSE', 100),
          ]),
        },
        fixedExpense: {
          findMany: jest.fn(async (query: { where: { userId: string } }) => {
            expect(query.where.userId).toBe(userId);
            return fixedExpenses;
          }),
        },
      };
      const service = new DashboardService(
        new DashboardRepository(prisma as never),
        new TransactionsRepository(prisma as never),
        { decrypt: (value: string) => JSON.parse(value) } as never,
      );

      const forecast = await service.getForecast(userId);
      expect(forecast).toMatchObject({
        month: '2026-07',
        currentBalance: 400,
        pendingFixedExpenses: 180,
        projectedBalance: 220,
      });
      expect(forecast.expenses.map((expense) => expense.id)).toEqual([
        'overdue',
        'unpaid',
        'next-cycle',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
