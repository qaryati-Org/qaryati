import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/pg-errors';
import { SourceService } from '../source';
import { CreateVillageNameDto } from './dto/create-village-name.dto';
import { VillageNameQueryDto } from './dto/village-name-query.dto';
import { VillageNameResponseDto } from './dto/village-name-response.dto';
import { VillageName } from './entities/village-name.entity';
import { Village } from './entities/village.entity';

const UQ_VILLAGE_NAME = 'uq_village_names_village_name';

// Alternative spellings, transliterations and historical names of a village.
@Injectable()
export class VillageNameService {
  constructor(
    @InjectRepository(VillageName)
    private readonly names: Repository<VillageName>,
    @InjectRepository(Village)
    private readonly villages: Repository<Village>,
    private readonly sources: SourceService,
  ) {}

  // A village has a handful of names, so the list is not paginated.
  async list(
    villageId: string,
    query: VillageNameQueryDto,
  ): Promise<VillageNameResponseDto[]> {
    await this.getVillageOrFail(villageId);
    const rows = await this.names.find({
      where: { villageId, ...(query.type ? { type: query.type } : {}) },
      order: { type: 'ASC', name: 'ASC', id: 'ASC' },
    });
    return rows.map((n) => VillageNameResponseDto.from(n));
  }

  async create(
    villageId: string,
    dto: CreateVillageNameDto,
  ): Promise<VillageNameResponseDto> {
    const village = await this.getVillageOrFail(villageId);
    // The current names live on the village; repeating one here would
    // count the same name twice.
    if (dto.name === village.nameAr || dto.name === village.nameEn) {
      throw new ConflictException(
        `"${dto.name}" is already the village's current name`,
      );
    }
    if (dto.sourceId) await this.sources.ensureExists(dto.sourceId);

    const name = this.names.create({
      villageId,
      name: dto.name,
      type: dto.type,
      language: dto.language,
      period: dto.period ?? null,
      note: dto.note ?? null,
      sourceId: dto.sourceId ?? null,
    });
    try {
      return VillageNameResponseDto.from(await this.names.save(name));
    } catch (error) {
      if (isUniqueViolation(error, UQ_VILLAGE_NAME)) {
        throw new ConflictException(
          `The village already has the name "${dto.name}"`,
        );
      }
      throw error;
    }
  }

  async remove(villageId: string, nameId: string): Promise<void> {
    const result = await this.names.delete({ id: nameId, villageId });
    if (!result.affected) {
      throw new NotFoundException(
        `Name ${nameId} not found for village ${villageId}`,
      );
    }
  }

  private async getVillageOrFail(id: string): Promise<Village> {
    const village = await this.villages.findOneBy({ id });
    if (!village) throw new NotFoundException(`Village ${id} not found`);
    return village;
  }
}
