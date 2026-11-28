import type { ApiResponseOptions } from '@nestjs/swagger';
import type { FieldError } from '../../common/errors/error-response';

const EXAMPLE_TIMESTAMP = '2026-11-28T18:04:16.004Z';
const EXAMPLE_CORRELATION_ID = '2f9c1a7e-6b1d-4c2e-9a51-0d3f6c8b7e21';

// Swagger response with an example in the API's one error format, so Swagger
// UI and API-Dog (which imports /api/docs-json) show what the API really
// returns, e.g.
//   @ApiConflictResponse(apiErrorExample('Email already registered',
//     '/api/v1/auth/register', 'CONFLICT', 'A user with this email already exists'))
export function apiErrorExample(
  description: string,
  path: string,
  code: string,
  message: string,
  details?: FieldError[],
): ApiResponseOptions {
  return {
    description,
    schema: {
      example: {
        error: {
          code,
          message,
          ...(details ? { details } : {}),
          path,
          timestamp: EXAMPLE_TIMESTAMP,
          correlationId: EXAMPLE_CORRELATION_ID,
        },
      },
    },
  };
}
