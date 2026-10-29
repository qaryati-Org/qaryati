import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { AdministrativeDivisionService } from './administrative-division.service';
import { MunicipalityQueryDto } from './dto/municipality-query.dto';
import { MunicipalityResponseDto } from './dto/municipality-response.dto';

@ApiTags('municipalities')
@Controller('municipalities')
export class MunicipalityController {
  constructor(private readonly divisions: AdministrativeDivisionService) {}

  @Get()
  @ApiOperation({
    summary: 'List municipalities and village councils with filters',
  })
  findAll(
    @Query() query: MunicipalityQueryDto,
  ): Promise<Paginated<MunicipalityResponseDto>> {
    return this.divisions.listMunicipalities(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one municipality or village council by id' })
  @ApiOkResponse({ type: MunicipalityResponseDto })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MunicipalityResponseDto> {
    return this.divisions.findMunicipality(id);
  }
}
