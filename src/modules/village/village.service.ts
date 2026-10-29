import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeLike } from '../../common/database/escape-like';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { VillageQueryDto } from './dto/village-query.dto';
import { VillageResponseDto } from './dto/village-response.dto';
import { Village } from './entities/village.entity';

@Injectable()
export class VillageService {
  constructor(
    @InjectRepository(Village)
    private readonly villages: Repository<Village>,
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
}
