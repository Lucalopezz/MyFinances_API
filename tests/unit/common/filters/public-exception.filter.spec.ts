import { BadRequestException, Logger } from '@nestjs/common';
import { PublicExceptionFilter } from 'src/common/filters/public-exception.filter';

describe('Respostas públicas de erro', () => {
  it('preserves business guidance, translates conflicts and omits internal financial details', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = jest.fn();
    const response = { status: jest.fn(() => ({ json })) };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    const filter = new PublicExceptionFilter();
    filter.catch(
      new BadRequestException('Limite insuficiente. Ajuste as parcelas.'),
      host as never,
    );
    expect(json).toHaveBeenLastCalledWith({
      statusCode: 400,
      message: 'Limite insuficiente. Ajuste as parcelas.',
    });
    filter.catch(
      { code: 'P2034', message: 'Prisma transaction error' },
      host as never,
    );
    expect(response.status).toHaveBeenLastCalledWith(409);
    expect(json.mock.calls.at(-1)![0].message).toContain('Atualize a página');
    filter.catch(
      new Error('Dados financeiros privados e detalhes do banco'),
      host as never,
    );
    expect(json.mock.calls.at(-1)![0]).toEqual({
      statusCode: 500,
      message: 'Não foi possível concluir a operação. Tente novamente.',
    });
    jest.restoreAllMocks();
  });
});
