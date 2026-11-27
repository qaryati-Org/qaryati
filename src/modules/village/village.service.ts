import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeLike } from '../../common/database/escape-like';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../common/database/pg-errors';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { CreateVillageDto } from './dto/create-village.dto';
import { UpdateVillageDto } from './dto/update-village.dto';
import { VillageQueryDto } from './dto/village-query.dto';
import { VillageResponseDto } from './dto/village-response.dto';
import { Governorate } from './entities/governorate.entity';
import { Municipality } from './entities/municipality.entity';
import { Village } from './entities/village.entity';

const UQ_VILLAGE_NAME = 'uq_villages_governorate_name_ar';

@Injectable()
export class VillageService {
  constructor(
    @InjectRepository(Village)
    private readonly villages: Repository<Village>,
    @InjectRepository(Governorate)
    private readonly governorates: Repository<Governorate>,
    @InjectRepository(Municipality)
    private readonly municipalities: Repository<Municipality>,
  ) {}

  async findAll(
    query: VillageQueryDto,
  ): Promise<Paginated<VillageResponseDto>> {
    const qb = this.villages
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.governorate', 'g')
      .leftJoinAndSelect('v.municipality', 'm');

    if (query.q) {
      qb.andWhere('(v.nameAr ILIKE :q OR v.nameEn ILIKE :q)', {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    if (query.governorateId) {
      qb.andWhere('v.governorateId = :gid', { gid: query.governorateId });
    }
    if (query.municipalityId) {
      qb.andWhere('v.municipalityId = :mid', { mid: query.municipalityId });
    }

    const [rows, total] = await qb
      .orderBy(
        `v.${query.sort ?? 'nameAr'}`,
        query.order === 'desc' ? 'DESC' : 'ASC',
      )
      .addOrderBy('v.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      rows.map((v) => VillageResponseDto.from(v)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<VillageResponseDto> {
    const village = await this.villages.findOne({
      where: { id },
      relations: { governorate: true, municipality: true },
    });
    if (!village) throw new NotFoundException(`Village ${id} not found`);
    return VillageResponseDto.from(village);
  }

  async create(dto: CreateVillageDto): Promise<VillageResponseDto> {
    const municipalityId = dto.municipalityId ?? null;
    await this.assertAdministration(dto.governorateId, municipalityId);

    const village = this.villages.create({
      nameAr: dto.nameAr,
      nameEn: dto.nameEn ?? null,
      nameOrigin: dto.nameOrigin ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      governorateId: dto.governorateId,
      municipalityId,
    });
    const saved = await this.save(village);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateVillageDto): Promise<VillageResponseDto> {
    // Loaded without relations on purpose: with the composite municipality
    // FK, a loaded relation object would win over the changed id columns.
    const village = await this.villages.findOneBy({ id });
    if (!village) throw new NotFoundException(`Village ${id} not found`);

    const governorateId = dto.governorateId ?? village.governorateId;
    const municipalityId =
      dto.municipalityId !== undefined
        ? dto.municipalityId
        : village.municipalityId;

    if (dto.governorateId !== undefined || dto.municipalityId !== undefined) {
      await this.assertAdministration(governorateId, municipalityId, {
        movedWithOldMunicipality:
          governorateId !== village.governorateId &&
          dto.municipalityId === undefined,
      });
    }

    if (dto.nameAr !== undefined) village.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined) village.nameEn = dto.nameEn;
    if (dto.nameOrigin !== undefined) village.nameOrigin = dto.nameOrigin;
    if (dto.latitude !== undefined) village.latitude = dto.latitude;
    if (dto.longitude !== undefined) village.longitude = dto.longitude;
    village.governorateId = governorateId;
    village.municipalityId = municipalityId;

    await this.save(village);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const village = await this.villages.findOneBy({ id });
    if (!village) throw new NotFoundException(`Village ${id} not found`);
    try {
      await this.villages.remove(village);
    } catch (error) {
      // Population records, and later other modules' data, reference the
      // village with ON DELETE RESTRICT: we never silently delete history.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Village ${id} still has related records (for example population records) and cannot be deleted`,
        );
      }
      throw error;
    }
  }

  // The governorate and municipality come from the request body, not the
  // URL, so unknown ids are 422 (like SourceService.ensureExists), not 404.
  private async assertAdministration(
    governorateId: string,
    municipalityId: string | null,
    options: { movedWithOldMunicipality?: boolean } = {},
  ): Promise<void> {
    if (!(await this.governorates.existsBy({ id: governorateId }))) {
      throw new UnprocessableEntityException(
        `Governorate ${governorateId} does not exist`,
      );
    }
    if (municipalityId === null) return;

    const municipality = await this.municipalities.findOneBy({
      id: municipalityId,
    });
    if (!municipality) {
      throw new UnprocessableEntityException(
        `Municipality ${municipalityId} does not exist`,
      );
    }
    if (municipality.governorateId !== governorateId) {
      throw new UnprocessableEntityException(
        options.movedWithOldMunicipality
          ? `The village's municipality ${municipalityId} is not in governorate ${governorateId}; send municipalityId (a municipality in the new governorate, or null) together with governorateId`
          : `Municipality ${municipalityId} is not in governorate ${governorateId}`,
      );
    }
  }

  // The checks above give clear errors in the normal case; the database
  // constraints still decide when two requests race each other.
  private async save(village: Village): Promise<Village> {
    try {
      return await this.villages.save(village);
    } catch (error) {
      if (isUniqueViolation(error, UQ_VILLAGE_NAME)) {
        throw new ConflictException(
          `A village named "${village.nameAr}" already exists in this governorate`,
        );
      }
      if (isForeignKeyViolation(error)) {
        throw new UnprocessableEntityException(
          'The governorate or municipality changed while saving; check governorateId and municipalityId',
        );
      }
      throw error;
    }
  }
}
