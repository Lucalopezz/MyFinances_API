import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AppModule } from '../app/app.module';
import { AuthModule } from '../auth/auth.module';
import { UsersRepository } from './repositories/users.repository';

@Module({
  controllers: [UserController],
  providers: [UserService, UsersRepository],
  imports: [forwardRef(() => AppModule), AuthModule],
})
export class UserModule {}
