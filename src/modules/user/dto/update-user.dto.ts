import { z } from 'zod';

export const UpdateUserSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: 'A senha deve ter no mínimo 8 caracteres.' })
      .max(128, { message: 'A senha deve ter no máximo 128 caracteres.' })
      .optional(),
    name: z
      .string()
      .min(3, { message: 'O nome de usuário deve ter no mínimo 3 caracteres.' })
      .max(50, {
        message: 'O nome de usuário deve ter no máximo 50 caracteres.',
      })
      .optional(),
  })
  .strict();

export type UpdateUserType = z.infer<typeof UpdateUserSchema>;
