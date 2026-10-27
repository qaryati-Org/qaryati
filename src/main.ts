import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

async function bootstrap() {
  const level = (process.env.LOG_LEVEL ?? 'log') as LogLevel;
  const app = await NestFactory.create(AppModule, {
    logger: LEVELS.slice(0, LEVELS.indexOf(level) + 1),
  });
  setupApp(app);

  // OpenAPI spec at /api/docs-json can be imported into API-Dog.
  const openApi = new DocumentBuilder()
    .setTitle('Qaryati API')
    .setDescription('Palestinian Villages Knowledge Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, openApi),
  );

  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
