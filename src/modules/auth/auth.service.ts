import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import jwtConfig from 'src/common/config/jwt.config';
import { HashingService } from './hashing/hashing.service';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthUsersRepository } from './repositories/auth-users.repository';
import { LoginType } from './dtos/login.dto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly hashingService: HashingService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly jwtService: JwtService,
    private readonly repository: AuthUsersRepository,
  ) {}

  private async signJwtAsync<T>(sub: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: sub,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }

  private async createTokens(user: User) {
    const accessToken = await this.signJwtAsync<Partial<User>>(
      user.id,
      this.jwtConfiguration.jwtTtl,
      { email: user.email },
    );

    return {
      accessToken,
    };
  }

  async login(loginDto: LoginType) {
    let passwordIsValid = false;
    let throwError = true;

    const user = await this.repository.findByEmail(loginDto.email);
    if (user) {
      passwordIsValid = await this.hashingService.compare(
        loginDto.password,
        user.password,
      );
    }
    if (passwordIsValid) {
      throwError = false;
    }
    if (throwError) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }
    return this.createTokens(user);
  }
}
