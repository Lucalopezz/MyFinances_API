import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { createTestApp, TestApp, TestUser } from '../support/test-app';

describe('Cadastro, sessão e perfil pela API', () => {
  let context: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    context = await createTestApp();
    user = await context.register();
  });
  afterAll(async () => context?.close());

  it('mantém health público e exige token para os recursos financeiros', async () => {
    await context.http().get('/health').expect(200);
    for (const path of [
      '/user/get-one',
      '/transactions',
      '/categories',
      '/budgets?month=2026-01',
      '/calendar?month=2026-01',
      '/cards',
      '/wishlist',
      '/notifications',
      '/exports/status',
      '/dashboard/forecast',
    ]) {
      await context.http().get(path).expect(401);
    }
  });

  it('persiste hash bcrypt sem expor a senha no perfil', async () => {
    const stored = await context.db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.password).not.toBe(user.password);
    expect(await compare(user.password, stored.password)).toBe(true);
    const profile = await context
      .http()
      .get('/user/get-one')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(profile.body).toMatchObject({ id: user.id, email: user.email });
    expect(profile.body).not.toHaveProperty('password');
  });

  it('recusa e-mail duplicado sem criar outro usuário', async () => {
    const count = await context.db.user.count();
    const result = await context
      .http()
      .post('/user')
      .send({ name: 'Duplicado', email: user.email, password: user.password })
      .expect(409);
    expect(JSON.stringify(result.body)).not.toContain('P2002');
    expect(await context.db.user.count()).toBe(count);
  });

  it.each([
    { email: 'inválido', password: 'curta' },
    { email: 'valid@example.test', password: 'valid-password', name: 'ab' },
    {
      email: 'valid@example.test',
      password: 'valid-password',
      name: 'Nome válido',
      role: 'admin',
    },
  ])('recusa cadastro inválido sem persistir: %j', async (body) => {
    const count = await context.db.user.count();
    await context.http().post('/user').send(body).expect(400);
    expect(await context.db.user.count()).toBe(count);
  });

  it('usa a mesma resposta para senha incorreta e conta inexistente', async () => {
    const wrong = await context
      .http()
      .post('/auth')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
    const missing = await context
      .http()
      .post('/auth')
      .send({ email: 'missing@example.test', password: user.password })
      .expect(401);
    expect(wrong.body.message).toEqual(missing.body.message);
  });

  it('recusa tokens adulterados, expirados ou emitidos para outra audiência', async () => {
    const jwt = new JwtService();
    const options = {
      secret: process.env.JWT_SECRET,
      audience: process.env.JWT_TOKEN_AUDIENCE,
      issuer: process.env.JWT_TOKEN_ISSUER,
    };
    const expired = jwt.sign({ sub: user.id, exp: 1 }, options);
    const otherAudience = jwt.sign(
      { sub: user.id },
      { ...options, audience: 'another-app' },
    );
    for (const token of ['invalid-token', expired, otherAudience]) {
      await context
        .http()
        .get('/user/get-one')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
  });

  it('altera nome e senha, permitindo login só com a nova senha', async () => {
    const separate = await context.register();
    const result = await context
      .http()
      .patch('/user/update')
      .auth(separate.token, { type: 'bearer' })
      .send({ name: 'Nome atualizado', password: 'new-password-456' })
      .expect(200);
    expect(result.body.user).toMatchObject({
      id: separate.id,
      name: 'Nome atualizado',
    });
    expect(result.body.user).not.toHaveProperty('password');
    await context
      .http()
      .post('/auth')
      .send({ email: separate.email, password: separate.password })
      .expect(401);
    await context
      .http()
      .post('/auth')
      .send({ email: separate.email, password: 'new-password-456' })
      .expect(201);
    const unchanged = await context
      .http()
      .get('/user/get-one')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(unchanged.body.name).toBe('Pessoa de teste');
  });
});
