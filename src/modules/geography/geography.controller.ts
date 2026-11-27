import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Role, Roles } from '../auth';
import { VillageResponseDto } from '../village/dto/village-response.dto';
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
}
