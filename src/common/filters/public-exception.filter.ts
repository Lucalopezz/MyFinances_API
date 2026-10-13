import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const defaults: Record<number, string> = {
  400: 'Confira os dados informados e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'O registro não foi encontrado. Atualize a página.',
  409: 'Os dados mudaram durante a operação. Atualize a página e tente novamente.',
  413: 'O arquivo ou os dados enviados são grandes demais.',
  429: 'Muitas tentativas. Aguarde um momento e tente novamente.',
};

/** Mantém orientações de negócio e converte falhas do banco em respostas públicas em português. */
@Catch()
export class PublicExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PublicExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const code = (exception as { code?: string } | null)?.code;
    let status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (code === 'P2034' || code === 'P2002') status = 409;
    if (code === 'P2025') status = 404;
    if (code === 'P2023') status = 400;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof body === 'string'
        ? body
        : (body as { message?: unknown } | null)?.message;
    const fallback =
      defaults[status] ??
      'Não foi possível concluir a operação. Tente novamente.';
    const safe = (value: unknown) =>
      typeof value === 'string' &&
      !/^(Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error|Conflict|Unprocessable Entity|Cannot |ThrottlerException)/i.test(
        value,
      )
        ? value
        : fallback;
    // Erros internos podem incluir documentos financeiros. Registramos somente
    // tipo/código, sem mensagem bruta, corpo da requisição, token ou stack.
    if (status >= 500)
      this.logger.error(
        `Falha interna: ${exception instanceof Error ? exception.name : 'erro'} (${code ?? 'sem código'})`,
      );
    response.status(status).json({
      statusCode: status,
      message:
        status >= 500
          ? fallback
          : Array.isArray(message)
            ? message.map(safe)
            : safe(message),
    });
  }
}
