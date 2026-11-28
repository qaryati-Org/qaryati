import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { apiErrorExample, Role, Roles } from '../auth';
import { CreateVillageNameDto } from './dto/create-village-name.dto';
import { VillageNameQueryDto } from './dto/village-name-query.dto';
import { VillageNameResponseDto } from './dto/village-name-response.dto';
import {
  EXAMPLE_UNKNOWN_ID,
  EXAMPLE_VILLAGE_ID,
  forbiddenExample,
  invalidIdExample,
  unauthorizedExample,
  unknownVillagePath,
  villageNotFoundExample,
  villagePath,
} from './village-api-examples';
import { VillageNameService } from './village-name.service';

const NAMES = villagePath('/names');

@ApiTags('villages')
@ApiExtraModels(VillageNameResponseDto)
@Controller('villages/:villageId/names')
export class VillageNameController {
  constructor(private readonly names: VillageNameService) {}

  @Get()
  @ApiOperation({
    summary:
      'List alternative spellings, transliterations and historical names',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(VillageNameResponseDto) },
        },
      },
    },
  })
  @ApiBadRequestResponse(invalidIdExample('/api/v1/villages/abc/names'))
  @ApiNotFoundResponse(villageNotFoundExample(unknownVillagePath('/names')))
  async list(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Query() query: VillageNameQueryDto,
  ): Promise<{ data: VillageNameResponseDto[] }> {
    return { data: await this.names.list(villageId, query) };
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Add another name to a village' })
  @ApiCreatedResponse({ type: VillageNameResponseDto })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid name data',
      NAMES,
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        { field: 'name', messages: ['name should not be empty'] },
        {
          field: 'type',
          messages: [
            'type must be one of the following values: ALTERNATIVE_SPELLING, TRANSLITERATION, HISTORICAL',
          ],
        },
        {
          field: 'language',
          messages: [
            'language must be a two-letter ISO 639-1 code, e.g. "ar" or "en"',
          ],
        },
      ],
    ),
  )
  @ApiUnauthorizedResponse(unauthorizedExample(NAMES))
  @ApiForbiddenResponse(forbiddenExample(NAMES, 'EDITOR or ADMIN'))
  @ApiNotFoundResponse(villageNotFoundExample(unknownVillagePath('/names')))
  @ApiConflictResponse(
    apiErrorExample(
      "The village already has this name, or it is the village's current name",
      NAMES,
      'CONFLICT',
      'The village already has the name "Burka"',
    ),
  )
  @ApiUnprocessableEntityResponse(
    apiErrorExample(
      'The cited source does not exist',
      NAMES,
      'UNPROCESSABLE_ENTITY',
      `Source ${EXAMPLE_UNKNOWN_ID} does not exist`,
    ),
  )
  create(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Body() dto: CreateVillageNameDto,
  ): Promise<VillageNameResponseDto> {
    return this.names.create(villageId, dto);
  }

  @Delete(':nameId')
  @Roles(Role.EDITOR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a name from a village' })
  @ApiNoContentResponse({ description: 'Name removed' })
  @ApiBadRequestResponse(invalidIdExample(`${NAMES}/abc`))
  @ApiUnauthorizedResponse(
    unauthorizedExample(`${NAMES}/${EXAMPLE_UNKNOWN_ID}`),
  )
  @ApiForbiddenResponse(
    forbiddenExample(`${NAMES}/${EXAMPLE_UNKNOWN_ID}`, 'EDITOR or ADMIN'),
  )
  @ApiNotFoundResponse(
    apiErrorExample(
      'Name not found for this village',
      `${NAMES}/${EXAMPLE_UNKNOWN_ID}`,
      'NOT_FOUND',
      `Name ${EXAMPLE_UNKNOWN_ID} not found for village ${EXAMPLE_VILLAGE_ID}`,
    ),
  )
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('nameId', new ParseUUIDPipe()) nameId: string,
  ): Promise<void> {
    return this.names.remove(villageId, nameId);
  }
}
