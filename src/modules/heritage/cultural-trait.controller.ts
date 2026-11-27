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
import type { AuthenticatedUser } from '../auth';
import { CurrentUser, Role, Roles } from '../auth';
import { CreateCulturalTraitDto } from './dto/create-cultural-trait.dto';
import { CulturalTraitQueryDto } from './dto/cultural-trait-query.dto';
import { CulturalTraitResponseDto } from './dto/cultural-trait-response.dto';
import { RejectCulturalTraitDto } from './dto/reject-cultural-trait.dto';
import { UpdateCulturalTraitDto } from './dto/update-cultural-trait.dto';
import { VerifyCulturalTraitDto } from './dto/verify-cultural-trait.dto';
import { CulturalTraitService } from './cultural-trait.service';

@ApiTags('cultural-traits')
@Controller('villages/:villageId/cultural-traits')
export class CulturalTraitController {
  constructor(private readonly culturalTraitService: CulturalTraitService) {}

  @Get()
  @ApiOperation({
    summary: 'List verified cultural traits for a village',
    description:
      'Only VERIFIED cultural traits are included in this public list.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(CulturalTraitResponseDto)
  @ApiOkResponse({
    description: 'Paginated verified cultural traits returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(CulturalTraitResponseDto) },
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
    @Query() query: CulturalTraitQueryDto,
  ): Promise<Paginated<CulturalTraitResponseDto>> {
    return this.culturalTraitService.list(villageId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a verified cultural trait' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Cultural Trait UUID' })
  @ApiOkResponse({ type: CulturalTraitResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({
    description: 'Village or verified cultural trait not found',
  })
  findOne(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CulturalTraitResponseDto> {
    return this.culturalTraitService.findOne(villageId, id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Create a cultural trait',
    description: 'New cultural traits always start with PENDING status.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiCreatedResponse({ type: CulturalTraitResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid village ID or cultural trait data',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  create(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Body() dto: CreateCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    return this.culturalTraitService.create(villageId, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Update a pending cultural trait',
    description: 'Only PENDING cultural traits can be edited.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Cultural Trait UUID' })
  @ApiOkResponse({ type: CulturalTraitResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or cultural trait data',
  })
  @ApiNotFoundResponse({ description: 'Village or cultural trait not found' })
  @ApiConflictResponse({
    description: 'Only PENDING cultural traits can be edited',
  })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  update(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    return this.culturalTraitService.update(villageId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a pending or rejected cultural trait',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Cultural Trait UUID' })
  @ApiNoContentResponse({ description: 'Cultural trait deleted' })
  @ApiBadRequestResponse({
    description: 'Invalid village or cultural trait ID',
  })
  @ApiNotFoundResponse({ description: 'Village or cultural trait not found' })
  @ApiConflictResponse({
    description: 'VERIFIED cultural traits cannot be deleted',
  })
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.culturalTraitService.remove(villageId, id);
  }

  @Post(':id/verify')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a cultural trait',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Cultural Trait UUID' })
  @ApiOkResponse({ type: CulturalTraitResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Cultural trait not found' })
  @ApiConflictResponse({
    description: 'The cultural trait cannot transition to VERIFIED',
  })
  verify(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyCulturalTraitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CulturalTraitResponseDto> {
    return this.culturalTraitService.verify(
      villageId,
      id,
      { reviewerId: user.id },
      dto,
    );
  }

  @Post(':id/reject')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a cultural trait',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Cultural Trait UUID' })
  @ApiOkResponse({ type: CulturalTraitResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Cultural trait not found' })
  @ApiConflictResponse({
    description: 'The cultural trait cannot transition to REJECTED',
  })
  reject(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectCulturalTraitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CulturalTraitResponseDto> {
    return this.culturalTraitService.reject(
      villageId,
      id,
      { reviewerId: user.id },
      dto,
    );
  }
}
