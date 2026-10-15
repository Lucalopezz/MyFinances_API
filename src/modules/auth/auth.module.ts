import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { HashingService } from './hashing/hashing.service';
import { BcryptService } from './hashing/bycript.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from 'src/common/config/jwt.config';
import { AuthUsersRepository } from './repositories/auth-users.repository';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthUsersRepository,
    {
      provide: HashingService,
      useClass: BcryptService,
    },
  ],
  exports: [HashingService, JwtModule, ConfigModule],
  imports: [
    PrismaModule,
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
})
export class AuthModule {}
