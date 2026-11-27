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
import { CreateLandmarkDto } from './dto/create-landmark.dto';
import { LandmarkQueryDto } from './dto/landmark-query.dto';
import { LandmarkResponseDto } from './dto/landmark-response.dto';
import { RejectLandmarkDto } from './dto/reject-landmark.dto';
import { UpdateLandmarkDto } from './dto/update-landmark.dto';
import { VerifyLandmarkDto } from './dto/verify-landmark.dto';
import { LandmarkService } from './landmark.service';

@ApiTags('landmarks')
@Controller('villages/:villageId/landmarks')
export class LandmarkController {
  constructor(private readonly landmarkService: LandmarkService) {}

  @Get()
  @ApiSecurity({})
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List landmarks for a village',
    description:
      'Defaults to VERIFIED landmarks, which are public. ' +
      'PENDING and REJECTED filters require an EDITOR, VERIFIER, or ADMIN access token.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(LandmarkResponseDto)
  @ApiOkResponse({
    description: 'Paginated landmarks returned',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(LandmarkResponseDto) },
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
  @ApiUnauthorizedResponse({
    description: 'Authentication required for PENDING or REJECTED landmarks',
  })
  @ApiForbiddenResponse({
    description: 'VIEWER role cannot view PENDING or REJECTED landmarks',
  })
  @ApiNotFoundResponse({ description: 'Village not found' })
  list(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: LandmarkQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<Paginated<LandmarkResponseDto>> {
    return this.landmarkService.list(villageId, query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a verified landmark' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village or record ID' })
  @ApiNotFoundResponse({
    description: 'Village or verified landmark not found',
  })
  findOne(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<LandmarkResponseDto> {
    return this.landmarkService.findOne(villageId, id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Create a landmark',
    description: 'New landmarks always start with PENDING status.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiCreatedResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village ID or landmark data' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  create(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Body() dto: CreateLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    return this.landmarkService.create(villageId, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Update a pending landmark',
    description: 'Only PENDING landmarks can be edited.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or landmark data' })
  @ApiNotFoundResponse({ description: 'Village or landmark not found' })
  @ApiConflictResponse({ description: 'Only PENDING landmarks can be edited' })
  @ApiUnprocessableEntityResponse({ description: 'Source not found' })
  update(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    return this.landmarkService.update(villageId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a pending or rejected landmark' })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiNoContentResponse({ description: 'Landmark deleted' })
  @ApiBadRequestResponse({ description: 'Invalid village or landmark ID' })
  @ApiNotFoundResponse({ description: 'Village or landmark not found' })
  @ApiConflictResponse({ description: 'VERIFIED landmarks cannot be deleted' })
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.landmarkService.remove(villageId, id);
  }

  @Post(':id/verify')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a landmark',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Landmark not found' })
  @ApiConflictResponse({
    description: 'The landmark cannot transition to VERIFIED',
  })
  verify(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyLandmarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LandmarkResponseDto> {
    return this.landmarkService.verify(
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
    summary: 'Reject a landmark',
    description:
      'Requires a VERIFIER or ADMIN access token. The reviewer is the caller.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Landmark not found' })
  @ApiConflictResponse({
    description: 'The landmark cannot transition to REJECTED',
  })
  reject(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectLandmarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LandmarkResponseDto> {
    return this.landmarkService.reject(
      villageId,
      id,
      { reviewerId: user.id },
      dto,
    );
  }
}
