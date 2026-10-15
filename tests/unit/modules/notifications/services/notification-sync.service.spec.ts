import { Logger } from '@nestjs/common';
import { NotificationSyncService } from 'src/modules/notifications/services/notification-sync.service';
import { FixedExpenseNotificationService } from 'src/modules/fixed-expenses/services/fixed-expense-notification.service';

describe('NotificationSyncService', () => {
  it('renova ciclos antes de avaliar notificações e preserva falha para nova tentativa', async () => {
    const calls: string[] = [];
    const recurrence = {
      refreshRecurringExpenses: jest.fn(async () => {
        calls.push('recorrência');
      }),
    };
    const service = new NotificationSyncService(
      {} as never,
      recurrence as never,
    );
    const evaluate = jest
      .spyOn(service, 'evaluate')
      .mockImplementation(async () => {
        calls.push('avaliação');
        throw new Error('falha de persistência');
      });
    await expect(service.synchronize('usuario')).rejects.toThrow(
      'falha de persistência',
    );
    expect(calls).toEqual(['recorrência', 'avaliação']);
    expect(evaluate).toHaveBeenCalledWith('usuario');
  });

  it('falha da integração auxiliar não invalida a operação financeira concluída', async () => {
    const evaluate = jest.fn().mockRejectedValue(new Error('indisponível'));
    const service = new FixedExpenseNotificationService({ evaluate } as never);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      service.processDueNotifications('usuario'),
    ).resolves.toBeUndefined();
    expect(evaluate).toHaveBeenCalledWith('usuario', true);
    expect(logger).toHaveBeenCalledWith(
      'Não foi possível atualizar os avisos de despesas fixas.',
    );
    logger.mockRestore();
  });
});
