import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      .innerJoinAndSelect('v.governorate', 'g');

    if (query.q) {
      qb.andWhere('(v.nameAr ILIKE :q OR v.nameEn ILIKE :q)', {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    if (query.governorateId) {
      qb.andWhere('v.governorateId = :gid', { gid: query.governorateId });
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
      relations: { governorate: true },
    });
    if (!village) throw new NotFoundException(`Village ${id} not found`);
    return VillageResponseDto.from(village);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
