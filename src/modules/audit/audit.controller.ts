import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { Role, Roles } from '../auth';
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
  @ApiBadRequestResponse({ description: 'Invalid filter' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Caller is not an ADMIN' })
  findAll(
    @Query() query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogResponseDto>> {
    return this.audit.findAll(query);
  }
}
