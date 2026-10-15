import { PublicExceptionFilter } from './common/filters/public-exception.filter';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalFilters(new PublicExceptionFilter());
  // Permite ajustar categorias das 1000 linhas de importação mantendo um limite para o corpo da requisição.
  app.useBodyParser('json', { limit: '256kb' });
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
