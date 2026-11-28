import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { apiErrorExample } from '../auth';
import { AdministrativeDivisionService } from './administrative-division.service';
import { MunicipalityQueryDto } from './dto/municipality-query.dto';
import { MunicipalityResponseDto } from './dto/municipality-response.dto';
import {
  EXAMPLE_UNKNOWN_ID,
  invalidIdExample,
  paginatedSchema,
} from './village-api-examples';

const MUNICIPALITIES = '/api/v1/municipalities';

@ApiTags('municipalities')
@ApiExtraModels(MunicipalityResponseDto)
@Controller('municipalities')
export class MunicipalityController {
  constructor(private readonly divisions: AdministrativeDivisionService) {}

  @Get()
  @ApiOperation({
    summary: 'List municipalities and village councils with filters',
  })
  @ApiOkResponse({
    description: 'Paginated municipalities and village councils',
    schema: paginatedSchema(getSchemaPath(MunicipalityResponseDto)),
  })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid paging, sort or filter',
      `${MUNICIPALITIES}?type=CITY`,
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        {
          field: 'type',
          messages: [
            'type must be one of the following values: MUNICIPALITY, VILLAGE_COUNCIL',
          ],
        },
      ],
    ),
  )
  findAll(
    @Query() query: MunicipalityQueryDto,
  ): Promise<Paginated<MunicipalityResponseDto>> {
    return this.divisions.listMunicipalities(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one municipality or village council by id' })
  @ApiOkResponse({ type: MunicipalityResponseDto })
  @ApiBadRequestResponse(invalidIdExample(`${MUNICIPALITIES}/abc`))
  @ApiNotFoundResponse(
    apiErrorExample(
      'No municipality with this id',
      `${MUNICIPALITIES}/${EXAMPLE_UNKNOWN_ID}`,
      'NOT_FOUND',
      `Municipality ${EXAMPLE_UNKNOWN_ID} not found`,
    ),
  )
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MunicipalityResponseDto> {
    return this.divisions.findMunicipality(id);
  }
}
