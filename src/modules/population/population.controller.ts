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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { Role, Roles } from '../auth';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
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
import {
  POPULATION_REVIEW_AUTH_UNAVAILABLE_MESSAGE,
  PopulationReviewAuthenticationGuard,
} from './population-review-auth.guard';
import { PopulationService } from './population.service';

// @Roles metadata is not enforced while the global RolesGuard allows all requests.
@ApiTags('population')
@Controller('villages/:villageId/population-records')
export class PopulationController {
  constructor(private readonly populationService: PopulationService) {}

  @Get()
  @ApiOperation({
    summary: 'List population records for a village',
    description:
      'Results default to VERIFIED records unless status is specified.',
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
  list(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: PopulationRecordQueryDto,
  ): Promise<Paginated<PopulationRecordResponseDto>> {
    return this.populationService.list(villageId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a population record by ID for a village' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({
    description: 'Village or population record not found',
  })
  findOne(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PopulationRecordResponseDto> {
    return this.populationService.findOne(villageId, id);
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
  @UseGuards(PopulationReviewAuthenticationGuard)
  @ApiOperation({
    summary: 'Verify a population record',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
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
  ): Promise<PopulationRecordResponseDto> {
    void villageId;
    void id;
    void dto;
    throw new UnauthorizedException(POPULATION_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.VERIFIER, Role.ADMIN)
  @UseGuards(PopulationReviewAuthenticationGuard)
  @ApiOperation({
    summary: 'Reject a population record',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Population record UUID' })
  @ApiOkResponse({ type: PopulationRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
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
  ): Promise<PopulationRecordResponseDto> {
    void villageId;
    void id;
    void dto;
    throw new UnauthorizedException(POPULATION_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
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
}
