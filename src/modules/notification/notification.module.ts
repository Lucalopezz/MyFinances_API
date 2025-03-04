import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
  imports: [forwardRef(() => AppModule), AuthModule],
})
export class NotificationModule {}
