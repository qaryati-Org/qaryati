import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { apiErrorExample, Role, Roles } from '../auth';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Who changed what and when (ADMIN only)',
    description:
      'Every insert, update and delete of village data and users, newest ' +
      'first. Filter by table, record, user, action and time range.',
  })
  @ApiExtraModels(AuditLogResponseDto)
  @ApiOkResponse({
    description: 'Paginated audit entries, newest first',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(AuditLogResponseDto) },
        },
        meta: {
          type: 'object',
          required: ['page', 'limit', 'total', 'totalPages'],
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 2 },
            totalPages: { type: 'integer', example: 1 },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid filter',
      '/api/v1/audit-logs?action=TRUNCATE&recordId=nope',
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        { field: 'recordId', messages: ['recordId must be a UUID'] },
        {
          field: 'action',
          messages: [
            'action must be one of the following values: INSERT, UPDATE, DELETE',
          ],
        },
      ],
    ),
  )
  @ApiUnauthorizedResponse(
    apiErrorExample(
      'Missing, invalid or expired access token',
      '/api/v1/audit-logs',
      'UNAUTHORIZED',
      'Authentication required',
    ),
  )
  @ApiForbiddenResponse(
    apiErrorExample(
      'Caller is not an ADMIN',
      '/api/v1/audit-logs',
      'FORBIDDEN',
      'Your role is not allowed to perform this action',
    ),
  )
  findAll(
    @Query() query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogResponseDto>> {
    return this.audit.findAll(query);
  }
}
