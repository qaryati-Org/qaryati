import {
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Role, Roles } from '../auth';
import { VillageResponseDto } from '../village/dto/village-response.dto';
import { NearbyVillagesQueryDto } from './dto/nearby-villages-query.dto';
import { NearbyVillagesResponseDto } from './dto/nearby-village-response.dto';
import { GeographyService } from './geography.service';

@ApiTags('geography')
@Controller('geography')
export class GeographyController {
  constructor(private readonly geographyService: GeographyService) {}

  @Post('villages/:id/geocode')
  @Roles(Role.EDITOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Geocode a village and save its coordinates' })
  @ApiParam({ name: 'id', type: String, description: 'Village UUID' })
  @ApiOkResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village ID' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({ description: 'Village already has coordinates' })
  @ApiUnprocessableEntityResponse({
    description: 'No location could be resolved for the village',
  })
  geocodeVillage(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VillageResponseDto> {
    return this.geographyService.geocodeVillage(id);
  }

  @Get('villages/:id/nearby')
  @ApiOperation({
    summary: 'Find villages within a radius of a reference village',
  })
  @ApiParam({ name: 'id', type: String, description: 'Reference village UUID' })
  @ApiQuery({
    name: 'radius',
    required: false,
    type: Number,
    default: 10,
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 100,
    description: 'Search radius in kilometers; must be greater than zero',
  })
  @ApiOkResponse({ type: NearbyVillagesResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid reference village ID or radius',
  })
  @ApiNotFoundResponse({ description: 'Reference village not found' })
  @ApiUnprocessableEntityResponse({
    description: 'Reference village does not have stored coordinates',
  })
  findNearbyVillages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: NearbyVillagesQueryDto,
  ): Promise<NearbyVillagesResponseDto> {
    return this.geographyService.findNearbyVillages(id, query);
  }
}
