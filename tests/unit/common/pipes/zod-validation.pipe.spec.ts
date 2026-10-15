import { BadRequestException } from '@nestjs/common';
import { purchaseSchema } from 'src/modules/cards/dto/cards.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

describe('Validação pública em português', () => {
  it('explica campos ausentes, parcelas inválidas e centavos sem mensagens padrão em inglês', () => {
    const pipe = new ZodValidationPipe(purchaseSchema);
    try {
      pipe.transform({ description: '', amount: 10.123, installments: 0 });
      throw new Error('Deveria rejeitar os dados');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toContain(
        'Valor: use no máximo duas casas decimais.',
      );
      expect(response.message).toContain(
        'Parcelas: informe um valor maior ou igual a 1.',
      );
      expect(response.message.join(' ')).not.toMatch(
        /Required|String must|Number must|Expected/,
      );
    }
  });
});
