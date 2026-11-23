import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { escapeLike } from '../../common/database/escape-like';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { VillageSearchQueryDto } from './dto/village-search-query.dto';
import {
  VillageSearchResultDto,
  VillageSearchRow,
} from './dto/village-search-result.dto';

// Folds the Arabic letter variants people type interchangeably, so "احمد",
// "أحمد" and "إحمد" match each other, and "ة"/"ه", "ى"/"ي" likewise. lower()
// makes Latin text case-insensitive. Both functions are IMMUTABLE, so the
// same expression can be indexed later (pg_trgm) without changing the query.
const normalize = (expr: string): string =>
  `translate(lower(${expr}), 'أإآٱىة', 'اااايه')`;

// Native SQL (the project requires some): searching across three name
// columns in two tables, ranking, de-duplicating per village and counting in
// one round trip is clearer here than in the query builder.
//
// $1 = the search text, $2 = the same text with LIKE wildcards escaped,
// $3 = optional governorate id, $4 = limit, $5 = offset.
export const VILLAGE_SEARCH_SQL = `
WITH candidates AS (
  SELECT v.id AS village_id, v.name_ar AS name, 'NAME_AR' AS matched_by
  FROM villages v
  UNION ALL
  SELECT v.id, v.name_en, 'NAME_EN'
  FROM villages v
  WHERE v.name_en IS NOT NULL
  UNION ALL
  SELECT n.village_id, n.name, n.type::text
  FROM village_names n
),
scored AS (
  -- 0 = exact match, 1 = starts with the text, 2 = contains it.
  SELECT c.village_id, c.name, c.matched_by,
         CASE
           WHEN ${normalize('c.name')} = ${normalize('$1')} THEN 0
           WHEN ${normalize('c.name')} LIKE ${normalize('$2')} || '%' THEN 1
           ELSE 2
         END AS rank
  FROM candidates c
  WHERE ${normalize('c.name')} LIKE '%' || ${normalize('$2')} || '%'
),
best AS (
  -- A village can match through several names; keep its best one.
  SELECT DISTINCT ON (s.village_id) s.village_id, s.name, s.matched_by, s.rank
  FROM scored s
  ORDER BY s.village_id, s.rank, s.name
),
results AS (
  SELECT b.village_id, b.name AS matched_name, b.matched_by, b.rank,
         v.name_ar, v.name_en,
         g.id AS governorate_id, g.name_ar AS governorate_name_ar,
         g.name_en AS governorate_name_en
  FROM best b
  JOIN villages v ON v.id = b.village_id
  JOIN governorates g ON g.id = v.governorate_id
  WHERE $3::uuid IS NULL OR v.governorate_id = $3::uuid
)
SELECT
  (SELECT count(*)::int FROM results) AS total,
  COALESCE(
    (SELECT json_agg(page ORDER BY page.rank, page."nameAr", page.id)
     FROM (
       SELECT r.village_id AS id,
              r.name_ar AS "nameAr",
              r.name_en AS "nameEn",
              json_build_object(
                'id', r.governorate_id,
                'nameAr', r.governorate_name_ar,
                'nameEn', r.governorate_name_en
              ) AS governorate,
              r.matched_name AS "matchedName",
              r.matched_by AS "matchedBy",
              r.rank
       FROM results r
       ORDER BY r.rank, r.name_ar, r.village_id
       LIMIT $4 OFFSET $5
     ) page),
    '[]'::json
  ) AS rows`;

@Injectable()
export class VillageSearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(
    query: VillageSearchQueryDto,
  ): Promise<Paginated<VillageSearchResultDto>> {
    const [result] = await this.dataSource.query<
      { total: number; rows: VillageSearchRow[] }[]
    >(VILLAGE_SEARCH_SQL, [
      query.q,
      escapeLike(query.q),
      query.governorateId ?? null,
      query.limit,
      query.offset,
    ]);

    return paginate(
      result.rows.map((row) => VillageSearchResultDto.from(row)),
      result.total,
      query,
    );
  }
}
