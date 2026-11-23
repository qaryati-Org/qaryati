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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Role, Roles } from '../auth';
import { CreateVillageNameDto } from './dto/create-village-name.dto';
import { VillageNameQueryDto } from './dto/village-name-query.dto';
import { VillageNameResponseDto } from './dto/village-name-response.dto';
import { VillageNameService } from './village-name.service';

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
  @ApiNotFoundResponse({ description: 'Village not found' })
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
  @ApiBadRequestResponse({ description: 'Invalid name data' })
  @ApiNotFoundResponse({ description: 'Village not found' })
  @ApiConflictResponse({
    description:
      "The village already has this name, or it is the village's current name",
  })
  @ApiUnprocessableEntityResponse({ description: 'Source does not exist' })
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
  @ApiNotFoundResponse({ description: 'Name not found for this village' })
  remove(
    @Param('villageId', new ParseUUIDPipe()) villageId: string,
    @Param('nameId', new ParseUUIDPipe()) nameId: string,
  ): Promise<void> {
    return this.names.remove(villageId, nameId);
  }
}
