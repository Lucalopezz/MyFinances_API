import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { NotificationsRepository } from 'src/modules/notifications/repositories/notifications.repository';

describe('NotificationsService', () => {
  it('updates only unread notifications belonging to the caller', async () => {
    const userId = '64f000000000000000000001';
    const updateMany = jest.fn(async () => ({ count: 3 }));
    const service = new NotificationsService(
      new NotificationsRepository({ notification: { updateMany } } as never),
    );
    expect(await service.markAllAsRead(userId)).toEqual({ count: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId, read: false },
      data: { read: true },
    });
  });
});
