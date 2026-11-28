import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../src/openapi';
import { createTestApp } from './utils/create-test-app';

type ErrorExample = { error: { code: string; message: string } };
type Response = {
  content?: Record<string, { schema?: { example?: unknown } }>;
};
type Operation = { responses: Record<string, Response> };

// API-Dog imports /api/docs-json, so these examples are what teammates and
// graders see there. Checks that every auth and audit error response
// documents the error format with the real code and message.
describe('OpenAPI examples for auth and audit (e2e)', () => {
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

  const errorExample = (path: string, method: string, status: string) =>
    operation(path, method).responses[status]?.content?.['application/json']
      ?.schema?.example as ErrorExample | undefined;

  it.each([
    ['/api/v1/auth/register', 'post', '400', 'VALIDATION_ERROR'],
    ['/api/v1/auth/register', 'post', '409', 'CONFLICT'],
    ['/api/v1/auth/register', 'post', '429', 'TOO_MANY_REQUESTS'],
    ['/api/v1/auth/login', 'post', '401', 'UNAUTHORIZED'],
    ['/api/v1/auth/login', 'post', '429', 'TOO_MANY_REQUESTS'],
    ['/api/v1/auth/refresh', 'post', '401', 'UNAUTHORIZED'],
    ['/api/v1/auth/me', 'get', '401', 'UNAUTHORIZED'],
    ['/api/v1/audit-logs', 'get', '400', 'VALIDATION_ERROR'],
    ['/api/v1/audit-logs', 'get', '401', 'UNAUTHORIZED'],
    ['/api/v1/audit-logs', 'get', '403', 'FORBIDDEN'],
  ])('%s %s documents %s as %s', (path, method, status, code) => {
    const example = errorExample(path, method, status);
    expect(example?.error.code).toBe(code);
    expect(example?.error.message).toEqual(expect.any(String));
  });

  it('documents the paginated audit list response', () => {
    const ok = operation('/api/v1/audit-logs', 'get').responses['200'];
    expect(JSON.stringify(ok)).toContain('AuditLogResponseDto');
  });

  it('gives request and response bodies example values', () => {
    const schemas = document.components?.schemas as Record<
      string,
      { properties: Record<string, { example?: unknown }> }
    >;
    for (const [schema, fields] of Object.entries({
      RegisterDto: ['email', 'password', 'displayName'],
      LoginDto: ['email', 'password'],
      RefreshTokenDto: ['refreshToken'],
      AuthResponseDto: [
        'accessToken',
        'tokenType',
        'expiresIn',
        'refreshToken',
      ],
      UserResponseDto: ['id', 'email', 'displayName', 'role', 'isActive'],
      AuditLogResponseDto: ['tableName', 'action', 'oldData', 'newData'],
    })) {
      for (const field of fields) {
        expect({
          field: `${schema}.${field}`,
          example: schemas[schema].properties[field].example,
        }).toEqual({ field: `${schema}.${field}`, example: expect.anything() });
      }
    }
  });
});
