import type { ApiResponseOptions } from '@nestjs/swagger';
import { apiErrorExample } from '../auth';

// Example ids used in the Swagger / API-Dog examples of the village module.
// Burqa (Nablus) from the reference seed, so the examples read like real data.
export const EXAMPLE_VILLAGE_ID = 'dcb3e6f5-5918-4f90-a821-452873eb79ff';
export const EXAMPLE_GOVERNORATE_ID = 'e5fb5848-0ebc-48dd-8eab-51e57a191334';
export const EXAMPLE_UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';

const VILLAGES = '/api/v1/villages';

// Responses every protected village endpoint can return. The messages are
// the ones the global guards send (see RolesGuard).
export const unauthorizedExample = (path: string): ApiResponseOptions =>
  apiErrorExample(
    'No access token, or an invalid or expired one',
    path,
    'UNAUTHORIZED',
    'Authentication required',
  );

export const forbiddenExample = (
  path: string,
  roles: string,
): ApiResponseOptions =>
  apiErrorExample(
    `Valid token, but the role is not ${roles}`,
    path,
    'FORBIDDEN',
    'Your role is not allowed to perform this action',
  );

export const invalidIdExample = (path: string): ApiResponseOptions =>
  apiErrorExample(
    'The id in the URL is not a UUID',
    path,
    'BAD_REQUEST',
    'Validation failed (uuid is expected)',
  );

export const villageNotFoundExample = (path: string): ApiResponseOptions =>
  apiErrorExample(
    'No village with this id',
    path,
    'NOT_FOUND',
    `Village ${EXAMPLE_UNKNOWN_ID} not found`,
  );

export const villagePath = (suffix = ''): string =>
  `${VILLAGES}/${EXAMPLE_VILLAGE_ID}${suffix}`;

export const unknownVillagePath = (suffix = ''): string =>
  `${VILLAGES}/${EXAMPLE_UNKNOWN_ID}${suffix}`;

// The `{ data, meta }` shape of every paginated list, for @ApiOkResponse.
export const paginatedSchema = (itemRef: string) => ({
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: { $ref: itemRef } },
    meta: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 116 },
        totalPages: { type: 'integer', example: 6 },
      },
    },
  },
});
