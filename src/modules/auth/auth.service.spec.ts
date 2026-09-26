import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUsersRepository } from './repositories/auth-users.repository';

describe('AuthService.login', () => {
  it('keeps token response and rejects invalid credentials', async () => {
    const user = {
      id: '64f000000000000000000001',
      email: 'user@example.com',
      password: 'hash',
    };
    const findUnique = jest.fn(async () => user);
    const compare = jest.fn(async (password: string) => password === 'correct');
    const signAsync = jest.fn(async () => 'signed-token');
    const service = new AuthService(
      { compare } as never,
      {
        audience: 'app',
        issuer: 'app',
        secret: 'secret',
        jwtTtl: 3600,
      } as never,
      { signAsync } as never,
      new AuthUsersRepository({ user: { findUnique } } as never),
    );

    expect(
      await service.login({ email: user.email, password: 'correct' }),
    ).toEqual({ accessToken: 'signed-token' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: user.email } });
    await expect(
      service.login({ email: user.email, password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
