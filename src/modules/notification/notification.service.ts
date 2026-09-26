import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateNotificationDtoType } from './dtos/notification.dto';
import { NotificationsRepository } from './repositories/notifications.repository';

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationsRepository) {}

  async createNotification(data: CreateNotificationDtoType) {
    return this.repository.create(data);
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.repository.findOwned(id, userId);

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    return this.repository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string) {
    const result = await this.repository.markAllAsRead(userId);
    return { count: result.count };
  }

  async getUserNotifications(userId: string) {
    return this.repository.findByUser(userId);
  }

  async deleteNotification(id: string, userId: string) {
    const notification = await this.repository.findOwned(id, userId);

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    return this.repository.remove(id, userId);
  }
}
