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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { Role, Roles } from '../auth';
import { CreateVillageDto } from './dto/create-village.dto';
import { UpdateVillageDto } from './dto/update-village.dto';
import { VillageQueryDto } from './dto/village-query.dto';
import { VillageResponseDto } from './dto/village-response.dto';
import { VillageService } from './village.service';

// Write endpoints declare their roles with @Roles; the global RolesGuard
// enforces them once JWT login exists, with no change needed here.
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
  @ApiNotFoundResponse({ description: 'Village not found' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VillageResponseDto> {
    return this.villageService.findOne(id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a village' })
  @ApiCreatedResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village data' })
  @ApiConflictResponse({
    description: 'A village with this Arabic name exists in the governorate',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Unknown governorate or municipality, or the municipality is in another governorate',
  })
  create(@Body() dto: CreateVillageDto): Promise<VillageResponseDto> {
    return this.villageService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Update a village' })
  @ApiOkResponse({ type: VillageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid village id or data' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({
    description: 'A village with this Arabic name exists in the governorate',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Unknown governorate or municipality, or the municipality is in another governorate',
  })
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
  @ApiBadRequestResponse({ description: 'Invalid village id' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({
    description: 'The village still has related records',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.villageService.remove(id);
  }
}
