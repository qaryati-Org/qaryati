import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// The OpenAPI document served at /api/docs-json (and imported into API-Dog).
// Shared by main.ts and the e2e tests, so the tests check the real document.
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Qaryati API')
    .setDescription('Palestinian Villages Knowledge Platform')
    .setVersion('1.0')
    // Protected endpoints and optionally authenticated reads reference this
    // scheme so Swagger UI sends the token entered under "Authorize".
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
