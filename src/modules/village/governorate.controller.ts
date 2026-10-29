import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdministrativeDivisionService } from './administrative-division.service';
import { GovernorateListResponseDto } from './dto/governorate-response.dto';

@ApiTags('governorates')
@Controller('governorates')
export class GovernorateController {
  constructor(private readonly divisions: AdministrativeDivisionService) {}

  @Get()
  @ApiOperation({ summary: 'List all Palestinian governorates' })
  @ApiOkResponse({ type: GovernorateListResponseDto })
  async findAll(): Promise<GovernorateListResponseDto> {
    return { data: await this.divisions.listGovernorates() };
  }
}
