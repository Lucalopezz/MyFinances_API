import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

describe('POST /auth', () => {
  let app: INestApplication;
  const login = jest.fn(async () => ({ accessToken: 'signed-token' }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  it('validates the request body before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/auth')
      .send({ email: 'invalid', password: 'short' })
      .expect(400);
    expect(login).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/auth')
      .send({ email: 'user@example.com', password: 'valid-password' })
      .expect(201)
      .expect({ accessToken: 'signed-token' });
    expect(login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'valid-password',
    });
  });
});
