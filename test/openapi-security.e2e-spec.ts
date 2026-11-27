import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../src/openapi';
import { createTestApp } from './utils/create-test-app';

type Operation = { security?: Record<string, string[]>[] };

// Swagger UI and API-Dog only send the bearer token to operations that list
// the security scheme, so every @Roles endpoint must list it.
describe('OpenAPI security (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createTestApp();
    document = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const operation = (path: string, method: string): Operation => {
    const item = document.paths[path] as Record<string, Operation> | undefined;
    const op = item?.[method];
    if (!op) throw new Error(`${method.toUpperCase()} ${path} not documented`);
    return op;
  };

  const usesBearer = (op: Operation): boolean =>
    (op.security ?? []).some((requirement) => 'bearer' in requirement);

  it('declares the bearer scheme', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it.each([
    ['/api/v1/villages', 'post'],
    ['/api/v1/villages/{id}', 'patch'],
    ['/api/v1/sources', 'post'],
    ['/api/v1/villages/{villageId}/population-records/{id}/verify', 'post'],
    ['/api/v1/villages/{villageId}/history/{id}/reject', 'post'],
    ['/api/v1/villages/{villageId}/landmarks', 'post'],
    ['/api/v1/villages/{villageId}/cultural-traits/{id}', 'delete'],
  ])('requires a bearer token for %s %s', (path, method) => {
    expect(usesBearer(operation(path, method))).toBe(true);
  });

  it.each([
    ['/api/v1/villages', 'get'],
    ['/api/v1/villages/search', 'get'],
    ['/api/v1/villages/{villageId}/landmarks', 'get'],
    ['/api/v1/auth/login', 'post'],
  ])('keeps %s %s public', (path, method) => {
    expect(usesBearer(operation(path, method))).toBe(false);
  });
});
