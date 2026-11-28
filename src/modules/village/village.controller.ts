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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { apiErrorExample, Role, Roles } from '../auth';
import { CreateVillageDto } from './dto/create-village.dto';
import { UpdateVillageDto } from './dto/update-village.dto';
import { VillageQueryDto } from './dto/village-query.dto';
import { VillageResponseDto } from './dto/village-response.dto';
import { VillageSearchQueryDto } from './dto/village-search-query.dto';
import { VillageSearchResultDto } from './dto/village-search-result.dto';
import {
  EXAMPLE_UNKNOWN_ID,
  EXAMPLE_VILLAGE_ID,
  forbiddenExample,
  invalidIdExample,
  paginatedSchema,
  unauthorizedExample,
  unknownVillagePath,
  villageNotFoundExample,
  villagePath,
} from './village-api-examples';
import { VillageSearchService } from './village-search.service';
import { VillageService } from './village.service';

const VILLAGES = '/api/v1/villages';

// Error examples below are copied from real responses of the running API, so
// Swagger UI and API-Dog (which imports /api/docs-json) show what clients get.
const duplicateNameExample = (path: string) =>
  apiErrorExample(
    'A village with this Arabic name already exists in the governorate',
    path,
    'CONFLICT',
    'A village named "برقة" already exists in this governorate',
  );

@ApiTags('villages')
@ApiExtraModels(VillageResponseDto, VillageSearchResultDto)
@Controller('villages')
export class VillageController {
  constructor(
    private readonly villageService: VillageService,
    private readonly villageSearchService: VillageSearchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List villages with search, filter, sort, paging' })
  @ApiOkResponse({
    description: 'Paginated villages',
    schema: paginatedSchema(getSchemaPath(VillageResponseDto)),
  })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid paging, sort or filter',
      `${VILLAGES}?page=0&limit=500`,
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        { field: 'page', messages: ['page must not be less than 1'] },
        { field: 'limit', messages: ['limit must not be greater than 100'] },
      ],
    ),
  )
  findAll(
    @Query() query: VillageQueryDto,
  ): Promise<Paginated<VillageResponseDto>> {
    return this.villageService.findAll(query);
  }

  // Declared before ':id' so "search" is not parsed as a village id.
  @Get('search')
  @ApiOperation({
    summary:
      'Search villages by Arabic, English and alternative names, ranked by relevance',
  })
  @ApiOkResponse({
    description: 'Matching villages, best match first',
    schema: paginatedSchema(getSchemaPath(VillageSearchResultDto)),
  })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Missing or invalid search text (2 to 100 characters)',
      `${VILLAGES}/search?q=a`,
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        {
          field: 'q',
          messages: ['q must be longer than or equal to 2 characters'],
        },
      ],
    ),
  )
  search(
    @Query() query: VillageSearchQueryDto,
  ): Promise<Paginated<VillageSearchResultDto>> {
    return this.villageSearchService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one village by id' })
  @ApiOkResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse(invalidIdExample(`${VILLAGES}/abc`))
  @ApiNotFoundResponse(villageNotFoundExample(unknownVillagePath()))
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VillageResponseDto> {
    return this.villageService.findOne(id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a village' })
  @ApiCreatedResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid village data',
      VILLAGES,
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        { field: 'nameAr', messages: ['nameAr should not be empty'] },
        {
          field: 'latitude',
          messages: ['latitude must not be greater than 90'],
        },
        { field: 'governorateId', messages: ['governorateId must be a UUID'] },
      ],
    ),
  )
  @ApiUnauthorizedResponse(unauthorizedExample(VILLAGES))
  @ApiForbiddenResponse(forbiddenExample(VILLAGES, 'EDITOR or ADMIN'))
  @ApiConflictResponse(duplicateNameExample(VILLAGES))
  @ApiUnprocessableEntityResponse(
    apiErrorExample(
      'Unknown governorate or municipality, or the municipality is in another governorate',
      VILLAGES,
      'UNPROCESSABLE_ENTITY',
      `Governorate ${EXAMPLE_UNKNOWN_ID} does not exist`,
    ),
  )
  create(@Body() dto: CreateVillageDto): Promise<VillageResponseDto> {
    return this.villageService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Update a village' })
  @ApiOkResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse(invalidIdExample(`${VILLAGES}/abc`))
  @ApiUnauthorizedResponse(unauthorizedExample(villagePath()))
  @ApiForbiddenResponse(forbiddenExample(villagePath(), 'EDITOR or ADMIN'))
  @ApiNotFoundResponse(villageNotFoundExample(unknownVillagePath()))
  @ApiConflictResponse(duplicateNameExample(villagePath()))
  @ApiUnprocessableEntityResponse(
    apiErrorExample(
      'Unknown governorate or municipality, or the municipality is in another governorate',
      villagePath(),
      'UNPROCESSABLE_ENTITY',
      `Municipality ${EXAMPLE_UNKNOWN_ID} does not exist`,
    ),
  )
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVillageDto,
  ): Promise<VillageResponseDto> {
    return this.villageService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a village that has no related records' })
  @ApiNoContentResponse({ description: 'Village deleted' })
  @ApiBadRequestResponse(invalidIdExample(`${VILLAGES}/abc`))
  @ApiUnauthorizedResponse(unauthorizedExample(villagePath()))
  @ApiForbiddenResponse(forbiddenExample(villagePath(), 'ADMIN'))
  @ApiNotFoundResponse(villageNotFoundExample(unknownVillagePath()))
  @ApiConflictResponse(
    apiErrorExample(
      'The village still has related records',
      villagePath(),
      'CONFLICT',
      `Village ${EXAMPLE_VILLAGE_ID} still has related records (for example population records) and cannot be deleted`,
    ),
  )
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.villageService.remove(id);
  }
}
