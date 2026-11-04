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
} from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/paginated';
import { Role, Roles } from '../auth';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourceQueryDto } from './dto/source-query.dto';
import { SourceResponseDto } from './dto/source-response.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { SourceService } from './source.service';

// Write endpoints declare their roles with @Roles. The global RolesGuard allows every request until JWT login exists, and enforces these roles afterwards without any change here.
@ApiTags('sources')
@Controller('sources')
export class SourceController {
  constructor(private readonly sources: SourceService) {}

  @Get()
  @ApiOperation({
    summary: 'List sources with optional filters and pagination',
  })
  @ApiOkResponse({ description: 'Sources returned' })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  findAll(
    @Query() query: SourceQueryDto,
  ): Promise<Paginated<SourceResponseDto>> {
    return this.sources.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a source by ID' })
  @ApiOkResponse({ type: SourceResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid source ID' })
  @ApiNotFoundResponse({ description: 'Source not found' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SourceResponseDto> {
    return this.sources.findOne(id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a source' })
  @ApiCreatedResponse({ type: SourceResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid source data' })
  create(@Body() dto: CreateSourceDto): Promise<SourceResponseDto> {
    return this.sources.create(dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Update a source' })
  @ApiOkResponse({ type: SourceResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid source ID or data' })
  @ApiNotFoundResponse({ description: 'Source not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSourceDto,
  ): Promise<SourceResponseDto> {
    return this.sources.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unreferenced source' })
  @ApiNoContentResponse({ description: 'Source deleted' })
  @ApiBadRequestResponse({ description: 'Invalid source ID' })
  @ApiNotFoundResponse({ description: 'Source not found' })
  @ApiConflictResponse({ description: 'Source is still referenced' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.sources.remove(id);
  }
}
