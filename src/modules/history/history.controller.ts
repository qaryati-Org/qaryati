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
import { CreateHistoryRecordDto } from './dto/create-history-record.dto';
import { HistoryRecordQueryDto } from './dto/history-record-query.dto';
import { HistoryRecordResponseDto } from './dto/history-record-response.dto';
import { RejectHistoryRecordDto } from './dto/reject-history-record.dto';
import { UpdateHistoryRecordDto } from './dto/update-history-record.dto';
import { VerifyHistoryRecordDto } from './dto/verify-history-record.dto';
import {
  HISTORY_AUTH_UNAVAILABLE_MESSAGE,
  HistoryAuthenticationGuard,
} from './history-authentication.guard';
import { HistoryService } from './history.service';

@ApiTags('history')
@Controller('villages/:villageId/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List verified history records for a village',
    description: 'Only VERIFIED records are included in this public timeline.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(HistoryRecordResponseDto)
  @ApiOkResponse({
    description: 'Paginated verified history records returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(HistoryRecordResponseDto) },
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
    @Query() query: HistoryRecordQueryDto,
  ): Promise<Paginated<HistoryRecordResponseDto>> {
    return this.historyService.list(villageId, query);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a history record' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiCreatedResponse({ type: HistoryRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village ID or history data' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({
    description: 'An overview already exists for this village',
  })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  create(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Body() dto: CreateHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    return this.historyService.create(villageId, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Update a pending history record',
    description: 'Only PENDING history records can be edited.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'History record UUID' })
  @ApiOkResponse({ type: HistoryRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or history data' })
  @ApiNotFoundResponse({ description: 'Village or history record not found' })
  @ApiConflictResponse({ description: 'History record cannot be edited' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  update(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    return this.historyService.update(villageId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a pending or rejected history record' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'History record UUID' })
  @ApiNoContentResponse({ description: 'History record deleted' })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({ description: 'Village or history record not found' })
  @ApiConflictResponse({ description: 'VERIFIED records cannot be deleted' })
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.historyService.remove(villageId, id);
  }

  @Post(':id/verify')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @UseGuards(HistoryAuthenticationGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a history record',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'History record UUID' })
  @ApiOkResponse({ type: HistoryRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'History record not found' })
  @ApiConflictResponse({
    description: 'The record cannot transition to VERIFIED',
  })
  // Keep the decorated parameters for Nest's route binding and validation.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  verify(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    throw new UnauthorizedException(HISTORY_AUTH_UNAVAILABLE_MESSAGE);
  }

  @Post(':id/reject')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @UseGuards(HistoryAuthenticationGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a history record',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'History record UUID' })
  @ApiOkResponse({ type: HistoryRecordResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'History record not found' })
  @ApiConflictResponse({
    description: 'The record cannot transition to REJECTED',
  })
  reject(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    throw new UnauthorizedException(HISTORY_AUTH_UNAVAILABLE_MESSAGE);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
