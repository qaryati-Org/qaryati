import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { VillageQueryDto } from './dto/village-query.dto';
import { VillageResponseDto } from './dto/village-response.dto';
import { VillageService } from './village.service';

@ApiTags('villages')
@Controller('villages')
export class VillageController {
  constructor(private readonly villageService: VillageService) {}

  @Get()
  @ApiOperation({ summary: 'List villages with search, filter, sort, paging' })
  findAll(
    @Query() query: VillageQueryDto,
  ): Promise<Paginated<VillageResponseDto>> {
    return this.villageService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one village by id' })
  @ApiOkResponse({ type: VillageResponseDto })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VillageResponseDto> {
    return this.villageService.findOne(id);
  }
}
