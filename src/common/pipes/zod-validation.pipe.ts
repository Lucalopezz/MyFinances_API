import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: any) {}

  transform(value: any) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errorMessages = result.error.issues.map((e) => {
        return `${e.message}`;
      });

      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: errorMessages,
      });
    }

    return result.data;
  }
}
