import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { ValidationException } from './common/errors/validation.exception';
import { corsOptions, parseCorsOrigins } from './modules/auth/cors';

// Shared by main.ts and the e2e tests so both run the exact same pipeline.
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        ValidationException.fromValidationErrors(errors),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // Off unless CORS_ORIGINS lists browser origins (validated at startup).
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  if (corsOrigins.length > 0) app.enableCors(corsOptions(corsOrigins));
  app.enableShutdownHooks();
}
