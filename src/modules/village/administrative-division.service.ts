import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeLike } from '../../common/database/escape-like';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { GovernorateResponseDto } from './dto/governorate-response.dto';
import { MunicipalityQueryDto } from './dto/municipality-query.dto';
import { MunicipalityResponseDto } from './dto/municipality-response.dto';
import { Governorate } from './entities/governorate.entity';
import { Municipality } from './entities/municipality.entity';

// Governorates and municipalities: the administrative structure villages
// belong to.
@Injectable()
export class AdministrativeDivisionService {
  constructor(
    @InjectRepository(Governorate)
    private readonly governorates: Repository<Governorate>,
    @InjectRepository(Municipality)
    private readonly municipalities: Repository<Municipality>,
  ) {}

  // Fixed reference data (16 rows), so it is returned whole, not paginated.
  async listGovernorates(): Promise<GovernorateResponseDto[]> {
    const rows = await this.governorates.find({ order: { nameEn: 'ASC' } });
    return rows.map((g) => GovernorateResponseDto.from(g));
  }

  async listMunicipalities(
    query: MunicipalityQueryDto,
  ): Promise<Paginated<MunicipalityResponseDto>> {
    const qb = this.municipalities
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.governorate', 'g');

    if (query.q) {
      qb.andWhere('(m.nameAr ILIKE :q OR m.nameEn ILIKE :q)', {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    if (query.governorateId) {
      qb.andWhere('m.governorateId = :gid', { gid: query.governorateId });
    }
    if (query.type) {
      qb.andWhere('m.type = :type', { type: query.type });
    }

    const [rows, total] = await qb
      .orderBy(
        `m.${query.sort ?? 'nameAr'}`,
        query.order === 'desc' ? 'DESC' : 'ASC',
      )
      .addOrderBy('m.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      rows.map((m) => MunicipalityResponseDto.from(m)),
      total,
      query,
    );
  }

  async findMunicipality(id: string): Promise<MunicipalityResponseDto> {
    const municipality = await this.municipalities.findOne({
      where: { id },
      relations: { governorate: true },
    });
    if (!municipality) {
      throw new NotFoundException(`Municipality ${id} not found`);
    }
    return MunicipalityResponseDto.from(municipality);
  }
}
