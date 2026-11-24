import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { VillageSearchQueryDto } from './dto/village-search-query.dto';
import { VillageSearchRow } from './dto/village-search-result.dto';
import { VillageNameType } from './entities/village-name.entity';
import {
  VILLAGE_SEARCH_SQL,
  VillageSearchService,
} from './village-search.service';

const governorate = { id: 'g-1', nameAr: 'نابلس', nameEn: 'Nablus' };

function row(rank: number): VillageSearchRow {
  return {
    id: `v-${rank}`,
    nameAr: 'برقة',
    nameEn: 'Burqa',
    governorate,
    matchedName: 'Burka',
    matchedBy: VillageNameType.ALTERNATIVE_SPELLING,
    rank,
  };
}

function query(params: Record<string, unknown>): VillageSearchQueryDto {
  return plainToInstance(VillageSearchQueryDto, params);
}

describe('VillageSearchService', () => {
  let dataSource: { query: jest.Mock };
  let service: VillageSearchService;

  beforeEach(() => {
    dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([{ total: 3, rows: [row(0), row(1), row(2)] }]),
    };
    service = new VillageSearchService(dataSource as unknown as DataSource);
  });

  it('passes the text, the LIKE-escaped text, filter and paging as parameters', async () => {
    await service.search(
      query({ q: '50%_off', governorateId: 'g-1', page: 3, limit: 10 }),
    );

    expect(dataSource.query).toHaveBeenCalledWith(VILLAGE_SEARCH_SQL, [
      '50%_off',
      '50\\%\\_off',
      'g-1',
      10,
      20,
    ]);
  });

  it('sends null when there is no governorate filter', async () => {
    await service.search(query({ q: 'برقة' }));

    expect(dataSource.query.mock.calls[0][1]).toEqual([
      'برقة',
      'برقة',
      null,
      20,
      0,
    ]);
  });

  it('maps rows and the rank to the response shape', async () => {
    const result = await service.search(query({ q: 'Bur' }));

    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
    expect(result.data.map((r) => r.match)).toEqual([
      'EXACT',
      'PREFIX',
      'CONTAINS',
    ]);
    expect(result.data[0]).toEqual({
      id: 'v-0',
      nameAr: 'برقة',
      nameEn: 'Burqa',
      governorate,
      matchedName: 'Burka',
      matchedBy: 'ALTERNATIVE_SPELLING',
      match: 'EXACT',
    });
  });

  it('never puts the search text inside the SQL string', () => {
    // Values only travel as $n parameters, so the query cannot be injected.
    expect(VILLAGE_SEARCH_SQL).toContain('$1');
    expect(VILLAGE_SEARCH_SQL).not.toMatch(/\$\{/);
  });
});
