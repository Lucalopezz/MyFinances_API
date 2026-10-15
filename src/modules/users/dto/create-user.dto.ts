import { z } from 'zod';

export const CreateUserSchema = z
  .object({
    email: z
      .string()
      .email({ message: 'O email deve ser um endereço válido.' }),
    password: z
      .string()
      .min(8, { message: 'A senha deve ter no mínimo 8 caracteres.' })
      .max(128, { message: 'A senha deve ter no máximo 128 caracteres.' }),
    name: z
      .string()
      .min(3, { message: 'O nome de usuário deve ter no mínimo 3 caracteres.' })
      .max(50, {
        message: 'O nome de usuário deve ter no máximo 50 caracteres.',
      }),
  })
  .strict();

export type CreateUserType = z.infer<typeof CreateUserSchema>;
