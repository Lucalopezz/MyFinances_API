import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class FixedExpenseErrorHandler {
  handleCreateError(error: unknown, userId: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new InternalServerErrorException(
          'Já existe uma despesa fixa com esse nome.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException(
          `Usuário com ID "${userId}" não encontrado.`,
        );
      }
    }

    throw new InternalServerErrorException('Erro ao criar a despesa fixa.');
  }

  handleFixedExpenseError(
    error: unknown,
    id: string,
    fallbackMessage: string,
  ): never {
    if (error instanceof NotFoundException) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException(
        `Despesa fixa com ID "${id}" não encontrada.`,
      );
    }

    throw new InternalServerErrorException(fallbackMessage);
  }

  handleUnexpected(error: unknown, fallbackMessage: string): never {
    if (error instanceof NotFoundException) {
      throw error;
    }

    throw new InternalServerErrorException(fallbackMessage);
  }
}
