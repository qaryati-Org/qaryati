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
import { CreateLandmarkDto } from './dto/create-landmark.dto';
import { LandmarkQueryDto } from './dto/landmark-query.dto';
import { LandmarkResponseDto } from './dto/landmark-response.dto';
import { RejectLandmarkDto } from './dto/reject-landmark.dto';
import { UpdateLandmarkDto } from './dto/update-landmark.dto';
import { VerifyLandmarkDto } from './dto/verify-landmark.dto';
import {
  LANDMARK_REVIEW_AUTH_UNAVAILABLE_MESSAGE,
  LandmarkReviewAuthenticationGuard,
} from './landmark-review-authentication.guard';
import { LandmarkService } from './landmark.service';

@ApiTags('landmarks')
@Controller('villages/:villageId/landmarks')
export class LandmarkController {
  constructor(private readonly landmarkService: LandmarkService) {}

  @Get()
  @ApiOperation({
    summary: 'List verified landmarks for a village',
    description: 'Only VERIFIED landmarks are included in this public list.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiExtraModels(LandmarkResponseDto)
  @ApiOkResponse({
    description: 'Paginated verified landmarks returned',
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
  @ApiNotFoundResponse({ description: 'Village not found' })
  list(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: LandmarkQueryDto,
  ): Promise<Paginated<LandmarkResponseDto>> {
    return this.landmarkService.list(villageId, query);
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
  @UseGuards(LandmarkReviewAuthenticationGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a landmark',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or review note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
  })
  @ApiForbiddenResponse({ description: 'Reviewer role is not permitted' })
  @ApiNotFoundResponse({ description: 'Landmark not found' })
  @ApiConflictResponse({
    description: 'The landmark cannot transition to VERIFIED',
  })
  // Keep the decorated parameters for Nest's route binding and validation.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  verify(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    throw new UnauthorizedException(LANDMARK_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
  }

  @Post(':id/reject')
  @Roles(Role.VERIFIER, Role.ADMIN)
  @UseGuards(LandmarkReviewAuthenticationGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a landmark',
    description:
      'Disabled until trusted authentication and role enforcement are integrated.',
  })
  @ApiParam({ name: 'villageId', type: String, description: 'Village UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Landmark UUID' })
  @ApiOkResponse({ type: LandmarkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or rejection note' })
  @ApiUnauthorizedResponse({
    description: 'Authenticated reviewer identity is not configured',
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
  ): Promise<LandmarkResponseDto> {
    throw new UnauthorizedException(LANDMARK_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
