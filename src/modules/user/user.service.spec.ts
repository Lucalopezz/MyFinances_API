import { UserService } from './user.service';
import { UsersRepository } from './repositories/users.repository';

describe('UserService', () => {
  it('keeps public create and update responses without exposing password hashes', async () => {
    const publicUser = {
      id: '64f000000000000000000001',
      name: 'Maria',
      email: 'maria@example.com',
      createdAt: new Date(),
    };
    const create = jest.fn(async () => publicUser);
    const findUnique = jest.fn(async () => publicUser);
    const update = jest.fn(async () => ({
      id: publicUser.id,
      name: 'Maria Silva',
      email: publicUser.email,
    }));
    const hash = jest.fn(async () => 'hashed-password');
    const service = new UserService(
      new UsersRepository({ user: { create, findUnique, update } } as never),
      { hash } as never,
    );

    expect(
      await service.create({
        name: 'Maria',
        email: publicUser.email,
        password: 'secret',
      }),
    ).toEqual({ message: 'Usuário criado com sucesso', user: publicUser });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Maria',
          email: publicUser.email,
          password: 'hashed-password',
        },
        select: { id: true, name: true, email: true, createdAt: true },
      }),
    );
    expect(
      await service.update(publicUser.id, { name: 'Maria Silva' }),
    ).toEqual({
      message: 'Usuário atualizado com sucesso',
      user: { id: publicUser.id, name: 'Maria Silva', email: publicUser.email },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: publicUser.id },
        data: { name: 'Maria Silva' },
        select: { id: true, name: true, email: true },
      }),
    );
  });
});
