import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

import {
  CreateNotificationDto,
  CreateNotificationDtoType,
  MarkAsReadDto,
  MarkAsReadDtoType,
} from './dtos/notification.dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  async createNotification(
    @Body(new ZodValidationPipe(CreateNotificationDto))
    createNotificationDto: CreateNotificationDtoType,
  ) {
    createNotificationDto.userId = '67c0b2bb3242fe3f7df1c069';
    return this.notificationService.createNotification(createNotificationDto);
  }

  @Patch(':id/mark-as-read')
  async markAsRead(
    @Param('id') id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body(new ZodValidationPipe(MarkAsReadDto)) data: MarkAsReadDtoType,
  ) {
    return this.notificationService.markAsRead(id);
  }

  @Get()
  async getNotifications() {
    return this.notificationService.getUserNotifications(
      '67c0b2bb3242fe3f7df1c069',
    );
  }

  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    return this.notificationService.deleteNotification(id);
  }
}
