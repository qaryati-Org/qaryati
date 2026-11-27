import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import type { AuthenticatedUser } from '../auth';
import { CurrentUser, Role, Roles } from '../auth';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
import { PopulationConflictsQueryDto } from './dto/population-conflicts-query.dto';
import {
  PopulationConflictGroupDto,
  PopulationConflictRecordDto,
} from './dto/population-conflicts-response.dto';
import { PopulationHistoryQueryDto } from './dto/population-history-query.dto';
import {
  PopulationHistoryResponseDto,
  PopulationHistorySourceDto,
} from './dto/population-history-response.dto';
import { PopulationRecordQueryDto } from './dto/population-record-query.dto';
import { PopulationRecordResponseDto } from './dto/population-record-response.dto';
import { RejectPopulationRecordDto } from './dto/reject-population-record.dto';
import { UpdatePopulationRecordDto } from './dto/update-population-record.dto';
import { VerifyPopulationRecordDto } from './dto/verify-population-record.dto';
import { PopulationService } from './population.service';

@ApiTags('population')
@Controller('villages/:villageId/population-records')
export class PopulationController {
  constructor(private readonly populationService: PopulationService) {}

  @Get()
  @ApiSecurity({})
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List population records for a village',
    description:
      'Results default to VERIFIED records. PENDING and REJECTED filters require an EDITOR, VERIFIER, or ADMIN access token.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(PopulationRecordResponseDto)
  @ApiOkResponse({
    description: 'Paginated population records returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(PopulationRecordResponseDto) },
        },
        meta: {
          type: 'object',
          required: ['page', 'limit', 'total', 'totalPages'],
          properties: {
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Records per page' },
            total: { type: 'integer', description: 'Total matching records' },
            totalPages: {
              type: 'integer',
              description: 'Total number of pages',
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid village ID or query parameters',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to request unverified records',
  })
  @ApiForbiddenResponse({
    description: 'Role is not permitted to request unverified records',
  })
  list(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: PopulationRecordQueryDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<Paginated<PopulationRecordResponseDto>> {
    return this.populationService.list(villageId, query, user);
  }

  @Get(':id')
  @ApiSecurity({})
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a population record by ID for a village',
    description:
      'VERIFIED records are public. PENDING and REJECTED records require an EDITOR, VERIFIER, or ADMIN access token.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({
    description: 'Village or population record not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to access unverified records',
  })
  @ApiForbiddenResponse({
    description: 'Role is not permitted to access unverified records',
  })
  findOne(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.findOne(villageId, id, user);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Create a population record',
    description: 'New population records always start with PENDING status.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiCreatedResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid village ID or population data',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({ description: 'Duplicate population figure' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  create(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Body() dto: CreatePopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.create(villageId, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Update a population record',
    description: 'Only PENDING population records can be edited.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or population data' })
  @ApiNotFoundResponse({ description: 'Population record not found' })
  @ApiConflictResponse({ description: 'Only PENDING records can be edited' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  update(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.update(villageId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a population record' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiNoContentResponse({ description: 'Population record deleted' })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({ description: 'Population record not found' })
  @ApiConflictResponse({ description: 'VERIFIED records cannot be deleted' })
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.populationService.remove(villageId, id);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.VERIFIER, Role.ADMIN)
  @ApiOperation({
    summary: 'Verify a population record',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Population record not found' })
  @ApiConflictResponse({
    description: 'The record cannot transition to VERIFIED',
  })
  verify(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyPopulationRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.verify(
      villageId,
      id,
      { reviewerId: user.id },
      dto,
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.VERIFIER, Role.ADMIN)
  @ApiOperation({
    summary: 'Reject a population record',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Population record not found' })
  @ApiConflictResponse({
    description: 'The record cannot transition to REJECTED',
  })
  reject(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectPopulationRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.reject(
      villageId,
      id,
      { reviewerId: user.id },
      dto,
    );
  }
}

@ApiTags('population')
@Controller('villages/:villageId')
export class PopulationHistoryController {
  constructor(private readonly populationService: PopulationService) {}

  @Get('population-history')
  @ApiOperation({
    summary: 'Get verified population history for a village',
    description:
      'Returns verified observations from oldest to newest; years without verified data are omitted.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(PopulationHistoryResponseDto, PopulationHistorySourceDto)
  @ApiOkResponse({
    description: 'Paginated verified population history returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(PopulationHistoryResponseDto) },
        },
        meta: {
          type: 'object',
          required: ['page', 'limit', 'total', 'totalPages'],
          properties: {
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Records per page' },
            total: {
              type: 'integer',
              description: 'Total verified observations',
            },
            totalPages: {
              type: 'integer',
              description: 'Total number of pages',
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid village ID or pagination parameters',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  history(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: PopulationHistoryQueryDto,
  ): Promise<Paginated<PopulationHistoryResponseDto>> {
    return this.populationService.history(villageId, query);
  }

  @Get('population-conflicts')
  @Roles(Role.EDITOR, Role.VERIFIER, Role.ADMIN)
  @ApiOperation({
    summary: 'List conflicting population records for a village',
    description:
      'A reference year conflicts when its records contain at least two distinct population values. Results include all records for each conflicting year.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(
    PopulationConflictGroupDto,
    PopulationConflictRecordDto,
    PopulationHistorySourceDto,
  )
  @ApiOkResponse({
    description: 'Paginated conflicting population years returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(PopulationConflictGroupDto) },
        },
        meta: {
          type: 'object',
          required: ['page', 'limit', 'total', 'totalPages'],
          properties: {
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Conflict years per page' },
            total: { type: 'integer', description: 'Total conflicting years' },
            totalPages: {
              type: 'integer',
              description: 'Total number of pages',
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid village ID or pagination parameters',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({
    description: 'Role is not permitted to view population conflicts',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  conflicts(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: PopulationConflictsQueryDto,
  ): Promise<Paginated<PopulationConflictGroupDto>> {
    return this.populationService.conflicts(villageId, query);
  }
}
