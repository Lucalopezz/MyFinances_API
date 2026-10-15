import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersRepository } from './repositories/users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  imports: [PrismaModule, AuthModule],
})
export class UsersModule {}
