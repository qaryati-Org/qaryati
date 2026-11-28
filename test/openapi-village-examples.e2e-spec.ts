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
// graders see there. Every documented error of the village, village name and
// municipality endpoints must show the API's error format with the real code.
describe('OpenAPI examples for villages (e2e)', () => {
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

  const VILLAGE = '/api/v1/villages/{id}';
  const NAMES = '/api/v1/villages/{villageId}/names';

  it.each([
    ['/api/v1/villages', 'get', '400', 'VALIDATION_ERROR'],
    ['/api/v1/villages/search', 'get', '400', 'VALIDATION_ERROR'],
    [VILLAGE, 'get', '400', 'BAD_REQUEST'],
    [VILLAGE, 'get', '404', 'NOT_FOUND'],
    ['/api/v1/villages', 'post', '400', 'VALIDATION_ERROR'],
    ['/api/v1/villages', 'post', '401', 'UNAUTHORIZED'],
    ['/api/v1/villages', 'post', '403', 'FORBIDDEN'],
    ['/api/v1/villages', 'post', '409', 'CONFLICT'],
    ['/api/v1/villages', 'post', '422', 'UNPROCESSABLE_ENTITY'],
    [VILLAGE, 'patch', '404', 'NOT_FOUND'],
    [VILLAGE, 'patch', '422', 'UNPROCESSABLE_ENTITY'],
    [VILLAGE, 'delete', '403', 'FORBIDDEN'],
    [VILLAGE, 'delete', '409', 'CONFLICT'],
    [NAMES, 'get', '404', 'NOT_FOUND'],
    [NAMES, 'post', '400', 'VALIDATION_ERROR'],
    [NAMES, 'post', '409', 'CONFLICT'],
    [NAMES, 'post', '422', 'UNPROCESSABLE_ENTITY'],
    [`${NAMES}/{nameId}`, 'delete', '404', 'NOT_FOUND'],
    ['/api/v1/municipalities', 'get', '400', 'VALIDATION_ERROR'],
    ['/api/v1/municipalities/{id}', 'get', '404', 'NOT_FOUND'],
  ])('%s %s documents %s as %s', (path, method, status, code) => {
    const example = errorExample(path, method, status);
    expect(example?.error.code).toBe(code);
    expect(example?.error.message).toEqual(expect.any(String));
  });

  it.each([
    ['/api/v1/villages', 'VillageResponseDto'],
    ['/api/v1/villages/search', 'VillageSearchResultDto'],
    ['/api/v1/municipalities', 'MunicipalityResponseDto'],
  ])('documents the paginated list of %s', (path, schema) => {
    const ok = operation(path, 'get').responses['200'];
    expect(JSON.stringify(ok)).toContain(schema);
    expect(JSON.stringify(ok)).toContain('totalPages');
  });

  it('gives response bodies example values', () => {
    const schemas = document.components?.schemas as Record<
      string,
      { properties: Record<string, { example?: unknown }> }
    >;
    for (const [schema, fields] of Object.entries({
      VillageResponseDto: ['id', 'nameAr', 'nameEn'],
      GovernorateResponseDto: ['id', 'nameAr', 'nameEn'],
      VillageSearchResultDto: ['nameAr', 'matchedName', 'matchedBy', 'match'],
      VillageNameResponseDto: ['name', 'type', 'language'],
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
