import { z } from 'zod';
import { NotificationType } from '@prisma/client';

export const CreateNotificationDto = z.object({
  title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres'),
  message: z.string().min(5, 'Mensagem deve ter pelo menos 5 caracteres'),
  type: z.nativeEnum(NotificationType),
  userId: z.string().min(1, 'ID do usuário é obrigatório'),
});

export type CreateNotificationDtoType = z.infer<typeof CreateNotificationDto>;

export const MarkAsReadDto = z.object({
  read: z.boolean(),
});

export type MarkAsReadDtoType = z.infer<typeof MarkAsReadDto>;
