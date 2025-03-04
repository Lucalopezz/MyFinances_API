import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

import {
  CreateNotificationDto,
  CreateNotificationDtoType,
  MarkAsReadDto,
  MarkAsReadDtoType,
} from './dtos/notification.dto';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('notifications')
@UseGuards(AuthTokenGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  async createNotification(
    @Body(new ZodValidationPipe(CreateNotificationDto))
    createNotificationDto: CreateNotificationDtoType,
    @User('sub') userId: string,
  ) {
    createNotificationDto.userId = userId;
    return this.notificationService.createNotification(createNotificationDto);
  }

  @Patch(':id/mark-as-read')
  async markAsRead(
    @Param('id') id: string,
    @User('sub') userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body(new ZodValidationPipe(MarkAsReadDto)) data: MarkAsReadDtoType,
  ) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Get()
  async getNotifications(@User('sub') userId: string) {
    return this.notificationService.getUserNotifications(userId);
  }

  @Delete(':id')
  async deleteNotification(
    @Param('id') id: string,
    @User('sub') userId: string,
  ) {
    return this.notificationService.deleteNotification(id, userId);
  }
}
