import { z } from 'zod';

export const LoginDtoSchema = z
  .object({
    email: z
      .string()
      .email({ message: 'O email deve ser um endereço válido.' }),
    password: z
      .string()
      .min(8, { message: 'A senha deve ter no mínimo 8 caracteres.' })
      .max(128, { message: 'A senha deve ter no máximo 128 caracteres.' }),
  })
  .strict();

export type LoginType = z.infer<typeof LoginDtoSchema>;
