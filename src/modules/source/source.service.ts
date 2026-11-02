import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { escapeLike } from '../../common/database/escape-like';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourceQueryDto } from './dto/source-query.dto';
import { SourceResponseDto } from './dto/source-response.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { Source } from './entities/source.entity';

const PG_FOREIGN_KEY_VIOLATION = '23503';

// Sources are the provenance layer; other modules use this service, never the repository.
@Injectable()
export class SourceService {
  constructor(
    @InjectRepository(Source)
    private readonly sources: Repository<Source>,
  ) {}

  async list(query: SourceQueryDto): Promise<Paginated<SourceResponseDto>> {
    const qb = this.sources.createQueryBuilder('s');

    if (query.q) {
      qb.andWhere('(s.title ILIKE :q OR s.author ILIKE :q)', {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    if (query.type) {
      qb.andWhere('s.type = :type', { type: query.type });
    }
    if (query.year) {
      qb.andWhere('s.year = :year', { year: query.year });
    }

    const [rows, total] = await qb
      .orderBy(
        `s.${query.sort ?? 'title'}`,
        query.order === 'desc' ? 'DESC' : 'ASC',
        'NULLS LAST',
      )
      .addOrderBy('s.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      rows.map((source) => SourceResponseDto.from(source)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<SourceResponseDto> {
    const source = await this.getOrFail(id);
    return SourceResponseDto.from(source);
  }

  // Other modules use this to return a 404 for an unknown sourceId.
  async ensureExists(id: string): Promise<void> {
    if (!(await this.sources.existsBy({ id }))) {
      throw new NotFoundException(`Source ${id} not found`);
    }
  }

  async create(dto: CreateSourceDto): Promise<SourceResponseDto> {
    const source = this.sources.create({
      title: dto.title,
      type: dto.type,
      author: dto.author ?? null,
      url: dto.url ?? null,
      year: dto.year ?? null,
    });
    return SourceResponseDto.from(await this.sources.save(source));
  }

  async update(id: string, dto: UpdateSourceDto): Promise<SourceResponseDto> {
    const source = await this.getOrFail(id);
    // Omit unsent fields so undefined does not erase stored values; null still clears optional fields.
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    Object.assign(source, changes);
    return SourceResponseDto.from(await this.sources.save(source));
  }

  async remove(id: string): Promise<void> {
    const source = await this.getOrFail(id);
    try {
      await this.sources.remove(source);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Source ${id} is still referenced by other records and cannot be deleted`,
        );
      }
      throw error;
    }
  }

  private async getOrFail(id: string): Promise<Source> {
    const source = await this.sources.findOneBy({ id });
    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }
    return source;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_FOREIGN_KEY_VIOLATION
  );
}
