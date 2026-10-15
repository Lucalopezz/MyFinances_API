import { FixedExpense } from '@prisma/client';
import {
  expenseNotification,
  needsNotificationSync,
} from 'src/modules/notifications/domain/notification-rules';
import { todayKey } from 'src/common/date/civil-date';

describe('Regras de notificações por dia financeiro', () => {
  const expense = (due: string, isPaid = false) =>
    ({
      name: 'Internet',
      amount: 99.9,
      dueDate: new Date(due),
      isPaid,
    }) as FixedExpense;

  it('inclui o terceiro dia inteiro, mesmo com vencimento às 23:59 UTC', () => {
    expect(
      expenseNotification(expense('2026-10-16T23:59:59Z'), '2026-10-13'),
    ).toMatchObject({
      event: 'UPCOMING',
      message: expect.stringContaining('vence em 3 dias'),
    });
    expect(
      expenseNotification(expense('2026-10-17T00:00:00Z'), '2026-10-13'),
    ).toBeNull();
  });
  it('distingue hoje, amanhã e atraso sem depender do horário do servidor', () => {
    expect(
      expenseNotification(expense('2026-10-13T12:00:00Z'), '2026-10-13')
        ?.message,
    ).toContain('vence hoje');
    expect(
      expenseNotification(expense('2026-10-14T12:00:00Z'), '2026-10-13')
        ?.message,
    ).toContain('vence em 1 dia.');
    expect(
      expenseNotification(expense('2026-10-12T12:00:00Z'), '2026-10-13'),
    ).toMatchObject({
      event: 'OVERDUE',
      type: 'ALERT',
      message: expect.stringContaining('venceu há 1 dia.'),
    });
    expect(
      expenseNotification(expense('2026-10-01T12:00:00Z'), '2026-10-13')
        ?.message,
    ).toContain('venceu há 12 dias');
  });
  it('não gera alerta para uma despesa paga', () => {
    expect(
      expenseNotification(expense('2026-10-12T12:00:00Z', true), '2026-10-13'),
    ).toBeNull();
  });
  it('usa São Paulo na virada de data UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T01:00:00Z'));
    try {
      expect(todayKey()).toBe('2026-10-13');
    } finally {
      jest.useRealTimers();
    }
  });
  it('respeita cinco minutos e permite forçar após uma alteração', () => {
    const state = {
      dayKey: '2026-10-13',
      lastCheckedAt: new Date('2026-10-13T12:00:00Z'),
    };
    expect(
      needsNotificationSync(
        state,
        new Date('2026-10-13T12:04:59Z'),
        state.dayKey,
        false,
      ),
    ).toBe(false);
    expect(
      needsNotificationSync(
        state,
        new Date('2026-10-13T12:05:00Z'),
        state.dayKey,
        false,
      ),
    ).toBe(true);
    expect(
      needsNotificationSync(state, state.lastCheckedAt, state.dayKey, true),
    ).toBe(true);
  });
  it('verifica no primeiro acesso e na virada do dia, mesmo dentro do intervalo', () => {
    const now = new Date('2026-10-14T03:01:00Z');
    expect(needsNotificationSync(null, now, '2026-10-14', false)).toBe(true);
    expect(
      needsNotificationSync(
        {
          dayKey: '2026-10-13',
          lastCheckedAt: new Date('2026-10-14T02:59:00Z'),
        },
        now,
        '2026-10-14',
        false,
      ),
    ).toBe(true);
  });
});
