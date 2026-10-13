import { validationMessage } from './validation-message';
import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errorMessages = result.error.issues.map(validationMessage);

      throw new BadRequestException({
        statusCode: 400,
        error: 'Dados inválidos',
        message: errorMessages,
      });
    }

    return result.data;
  }
}
