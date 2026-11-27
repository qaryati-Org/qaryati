import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';
import { setupApp } from './setup-app';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

async function bootstrap() {
  const level = (process.env.LOG_LEVEL ?? 'log') as LogLevel;
  const app = await NestFactory.create(AppModule, {
    logger: LEVELS.slice(0, LEVELS.indexOf(level) + 1),
  });
  setupApp(app);

  // OpenAPI spec at /api/docs-json can be imported into API-Dog.
  SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app));

  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
