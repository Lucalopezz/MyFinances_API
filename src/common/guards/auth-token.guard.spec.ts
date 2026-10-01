import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { REQUEST_TOKEN_PAYLOAD_KEY } from 'src/modules/auth/auth.constants';
import { AuthTokenGuard } from './auth-token.guard';

describe('AuthTokenGuard', () => {
  const config = { secret: 'secret', audience: 'app', issuer: 'app' };

  function setup(
    authorization?: string,
    payload: unknown = { sub: 'user-id' },
  ) {
    const request = { headers: { authorization } };
    const verifyAsync = jest.fn(async () => payload);
    const guard = new AuthTokenGuard({ verifyAsync } as never, config as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
    return { guard, context, request, verifyAsync };
  }

  it('accepts a valid Bearer token and stores its payload', async () => {
    const { guard, context, request, verifyAsync } = setup('Bearer signed');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('signed', config);
    expect(request[REQUEST_TOKEN_PAYLOAD_KEY]).toEqual({ sub: 'user-id' });
  });

  it.each(['signed', 'Basic signed', 'Bearer ', 'Bearer one two'])(
    'rejects an invalid authorization header: %s',
    async (authorization) => {
      const { guard, context, verifyAsync } = setup(authorization);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('rejects a verified payload without a subject', async () => {
    const { guard, context } = setup('Bearer signed', {});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
