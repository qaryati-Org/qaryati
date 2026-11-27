import type { EntityManager } from 'typeorm';
import dataSource from '../data-source';

const PERFORMANCE_DATABASE = 'qaryati_perf';
const FIXTURE_MARKER = 'QARYATI-HERITAGE-PERF-V1';
const DEFAULT_VILLAGE_COUNT = 5;
const MAX_VILLAGE_COUNT = 20;
const MIN_RECORDS_PER_VILLAGE = 20;
const DEFAULT_RECORDS_PER_VILLAGE = 60;
const MAX_RECORDS_PER_VILLAGE = 2000;

const LANDMARK_SOURCE = {
  id: 'f04f0000-0000-4000-8000-000000000001',
  title: 'Qaryati Heritage Performance Fixture - Landmarks',
  type: 'OTHER',
  author: FIXTURE_MARKER,
  url: null,
  year: 2026,
};

const CULTURAL_TRAIT_SOURCE = {
  id: 'f04f0000-0000-4000-8000-000000000002',
  title: 'Qaryati Heritage Performance Fixture - Cultural Traits',
  type: 'OTHER',
  author: FIXTURE_MARKER,
  url: null,
  year: 2026,
};

interface SeedOptions {
  clear: boolean;
  villageCount: number;
  recordsPerVillage: number;
}

interface FixtureSource {
  id: string;
  title: string;
  type: string;
  author: string | null;
  url: string | null;
  year: number | null;
}

type FixtureSourceRow = FixtureSource;

interface DatabaseTarget {
  database: string;
}

function parseCount(
  args: string[],
  option: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const indexes = args.flatMap((arg, index) => (arg === option ? [index] : []));
  if (indexes.length > 1) {
    throw new Error(`${option} may only be specified once`);
  }
  if (indexes.length === 0) {
    return fallback;
  }

  const value = args[indexes[0] + 1];
  const count = Number(value);
  if (
    value === undefined ||
    value.startsWith('--') ||
    !Number.isInteger(count) ||
    count < minimum ||
    count > maximum
  ) {
    throw new Error(
      `${option} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return count;
}

function parseArgs(args: string[]): SeedOptions {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--clear') {
      if (args.indexOf(arg) !== index) {
        throw new Error('--clear may only be specified once');
      }
      continue;
    }
    if (arg === '--villages' || arg === '--records-per-village') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a numeric value`);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    clear: args.includes('--clear'),
    villageCount: parseCount(
      args,
      '--villages',
      DEFAULT_VILLAGE_COUNT,
      1,
      MAX_VILLAGE_COUNT,
    ),
    recordsPerVillage: parseCount(
      args,
      '--records-per-village',
      DEFAULT_RECORDS_PER_VILLAGE,
      MIN_RECORDS_PER_VILLAGE,
      MAX_RECORDS_PER_VILLAGE,
    ),
  };
}

function assertSafeConfiguredTarget(): void {
  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('Refusing to seed Heritage performance data in production');
  }
  if (process.env.ALLOW_HERITAGE_PERF_SEED !== 'true') {
    throw new Error(
      'Refusing to connect; explicitly set ALLOW_HERITAGE_PERF_SEED=true to run the Heritage performance fixture',
    );
  }

  const options = dataSource.options;
  if (options.type !== 'postgres') {
    throw new Error('Heritage performance fixture requires PostgreSQL');
  }

  const host =
    typeof options.host === 'string' ? options.host.trim().toLowerCase() : '';
  const database =
    typeof options.database === 'string' ? options.database.trim() : '';
  const configuredHost = process.env.DB_HOST?.trim().toLowerCase() ?? '';
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (database !== PERFORMANCE_DATABASE || process.env.DB_NAME !== database) {
    throw new Error(
      `Refusing database "${database || '(unset)'}"; explicitly set DB_NAME=${PERFORMANCE_DATABASE}`,
    );
  }
  if (!localHosts.has(host) || configuredHost !== host) {
    throw new Error(
      `Refusing database host "${host || '(unset)'}"; configure DB_HOST as localhost, 127.0.0.1, or ::1`,
    );
  }

  const port = options.port ?? 5432;
  console.log(
    `Verified configured target: ${host}:${port}/${database}; automatic migrations are disabled.`,
  );
}

async function assertConnectedTarget(): Promise<void> {
  const [target] = await dataSource.query<DatabaseTarget[]>(
    `SELECT current_database() AS database`,
  );
  if (target.database !== PERFORMANCE_DATABASE) {
    throw new Error(
      `Refusing connected PostgreSQL database "${target.database}"`,
    );
  }
  console.log(`Verified connected database: ${target.database}.`);
}

function sourceMatches(
  existing: FixtureSourceRow,
  expected: FixtureSource,
): boolean {
  return (
    existing.id === expected.id &&
    existing.title === expected.title &&
    existing.type === expected.type &&
    existing.author === expected.author &&
    existing.url === expected.url &&
    existing.year === expected.year
  );
}

async function ensureFixtureSource(
  manager: EntityManager,
  source: FixtureSource,
  createIfMissing: boolean,
): Promise<boolean> {
  const rows = await manager.query<FixtureSourceRow[]>(
    `SELECT id, title, type, author, url, year
     FROM sources
     WHERE id = $1`,
    [source.id],
  );
  if (rows.length > 0) {
    if (!sourceMatches(rows[0], source)) {
      throw new Error(
        `Fixture source ID collision at ${source.id}; no data was changed`,
      );
    }
    return true;
  }
  if (!createIfMissing) {
    return false;
  }

  await manager.query(
    `INSERT INTO sources (id, title, type, author, url, year)
     VALUES ($1, $2, $3::source_type, $4, $5, $6)`,
    [
      source.id,
      source.title,
      source.type,
      source.author,
      source.url,
      source.year,
    ],
  );
  return true;
}

async function findFixtureVillages(
  manager: EntityManager,
  villageCount: number,
): Promise<string[]> {
  const villages = await manager.query<{ id: string }[]>(
    `SELECT id
     FROM villages
     WHERE name_en LIKE 'PERF Village %'
     ORDER BY name_en COLLATE "C", id
     LIMIT $1`,
    [villageCount],
  );
  if (villages.length < villageCount) {
    throw new Error(
      `Found ${villages.length} PERF Village rows; need ${villageCount}. Add synthetic villages to ${PERFORMANCE_DATABASE} first.`,
    );
  }
  return villages.map((village) => village.id);
}

async function deleteFixtureRecords(
  manager: EntityManager,
): Promise<{ landmarks: number; culturalTraits: number }> {
  const [landmarkResult] = await manager.query<{ count: number }[]>(
    `WITH deleted AS (
       DELETE FROM landmarks
       WHERE source_id = $1
         AND name LIKE 'Perf Landmark %'
         AND description LIKE $2
         AND review_note = $3
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM deleted`,
    [LANDMARK_SOURCE.id, `${FIXTURE_MARKER}:landmark:%`, FIXTURE_MARKER],
  );
  const [culturalTraitResult] = await manager.query<{ count: number }[]>(
    `WITH deleted AS (
       DELETE FROM cultural_traits
       WHERE source_id = $1
         AND name LIKE 'Perf Cultural Trait %'
         AND description LIKE $2
         AND review_note = $3
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM deleted`,
    [
      CULTURAL_TRAIT_SOURCE.id,
      `${FIXTURE_MARKER}:cultural-trait:%`,
      FIXTURE_MARKER,
    ],
  );
  return {
    landmarks: landmarkResult.count,
    culturalTraits: culturalTraitResult.count,
  };
}

async function insertLandmarks(
  manager: EntityManager,
  villageIds: string[],
  recordsPerVillage: number,
): Promise<number> {
  const rows = await manager.query<{ id: string }[]>(
    `WITH generated AS (
       SELECT village.id AS village_id,
              record.record_number,
              CASE ((record.record_number - 1) % 5)
                WHEN 0 THEN 'SPRING'::landmark_type
                WHEN 1 THEN 'RELIGIOUS_SITE'::landmark_type
                WHEN 2 THEN 'ARCHAEOLOGICAL_SITE'::landmark_type
                WHEN 3 THEN 'OLD_BUILDING'::landmark_type
                ELSE 'VIEWPOINT'::landmark_type
              END AS type
       FROM unnest($2::uuid[]) AS village(id)
       CROSS JOIN generate_series(1, $3::integer) AS record(record_number)
     )
     INSERT INTO landmarks (
       village_id, source_id, name, type, description, status,
       reviewed_at, review_note
     )
     SELECT village_id,
            $1,
            'Perf Landmark '
              || lpad(record_number::text, 4, '0')
              || ' '
              || type::text,
            type,
            $4 || ':landmark:' || record_number::text,
            'VERIFIED',
            now(),
            $4
     FROM generated
     RETURNING id`,
    [LANDMARK_SOURCE.id, villageIds, recordsPerVillage, FIXTURE_MARKER],
  );
  return rows.length;
}

async function insertCulturalTraits(
  manager: EntityManager,
  villageIds: string[],
  recordsPerVillage: number,
): Promise<number> {
  const rows = await manager.query<{ id: string }[]>(
    `WITH generated AS (
       SELECT village.id AS village_id,
              record.record_number,
              CASE ((record.record_number - 1) % 3)
                WHEN 0 THEN 'CRAFT'::cultural_trait_type
                WHEN 1 THEN 'FOOD'::cultural_trait_type
                ELSE 'FARMING_PRACTICE'::cultural_trait_type
              END AS type
       FROM unnest($2::uuid[]) AS village(id)
       CROSS JOIN generate_series(1, $3::integer) AS record(record_number)
     )
     INSERT INTO cultural_traits (
       village_id, source_id, name, type, description, status,
       reviewed_at, review_note
     )
     SELECT village_id,
            $1,
            'Perf Cultural Trait '
              || lpad(record_number::text, 4, '0')
              || ' '
              || type::text,
            type,
            $4 || ':cultural-trait:' || record_number::text,
            'VERIFIED',
            now(),
            $4
     FROM generated
     RETURNING id`,
    [CULTURAL_TRAIT_SOURCE.id, villageIds, recordsPerVillage, FIXTURE_MARKER],
  );
  return rows.length;
}

async function removeFixtureSource(
  manager: EntityManager,
  source: FixtureSource,
): Promise<boolean> {
  const result = await manager.query<[{ id: string }[], number]>(
    `DELETE FROM sources AS s
     WHERE s.id = $1
       AND s.title = $2
       AND s.type = $3::source_type
       AND s.author = $4
       AND s.url IS NULL
       AND s.year = $5
       AND NOT EXISTS (
         SELECT 1 FROM village_names WHERE source_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM population_records WHERE source_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM history_records WHERE source_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM landmarks WHERE source_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM cultural_traits WHERE source_id = s.id
       )
     RETURNING s.id`,
    [source.id, source.title, source.type, source.author, source.year],
  );
  return result[1] === 1;
}

async function clearFixture(): Promise<void> {
  const result = await dataSource.transaction(async (manager) => {
    const landmarkSourceExists = await ensureFixtureSource(
      manager,
      LANDMARK_SOURCE,
      false,
    );
    const culturalTraitSourceExists = await ensureFixtureSource(
      manager,
      CULTURAL_TRAIT_SOURCE,
      false,
    );
    const deleted = await deleteFixtureRecords(manager);
    const deletedLandmarkSource = landmarkSourceExists
      ? await removeFixtureSource(manager, LANDMARK_SOURCE)
      : false;
    const deletedCulturalTraitSource = culturalTraitSourceExists
      ? await removeFixtureSource(manager, CULTURAL_TRAIT_SOURCE)
      : false;
    return {
      ...deleted,
      deletedLandmarkSource,
      deletedCulturalTraitSource,
    };
  });

  console.log(
    `Removed ${result.landmarks} fixture landmarks and ${result.culturalTraits} fixture cultural traits.`,
  );
  console.log(
    `Removed ${Number(result.deletedLandmarkSource) + Number(result.deletedCulturalTraitSource)} unreferenced fixture sources. Existing villages and any sources referenced by other records were kept.`,
  );
}

async function seedFixture(options: SeedOptions): Promise<void> {
  const result = await dataSource.transaction(async (manager) => {
    const villageIds = await findFixtureVillages(manager, options.villageCount);
    await ensureFixtureSource(manager, LANDMARK_SOURCE, true);
    await ensureFixtureSource(manager, CULTURAL_TRAIT_SOURCE, true);
    const removed = await deleteFixtureRecords(manager);
    const landmarks = await insertLandmarks(
      manager,
      villageIds,
      options.recordsPerVillage,
    );
    const culturalTraits = await insertCulturalTraits(
      manager,
      villageIds,
      options.recordsPerVillage,
    );
    return { villageIds, removed, landmarks, culturalTraits };
  });

  console.log(
    `Seeded ${result.landmarks} VERIFIED landmarks and ${result.culturalTraits} VERIFIED cultural traits across ${result.villageIds.length} villages (${options.recordsPerVillage} per type per village).`,
  );
  console.log(
    `Replaced ${result.removed.landmarks} prior fixture landmarks and ${result.removed.culturalTraits} prior fixture cultural traits.`,
  );
  console.log(`VILLAGE_IDS=${result.villageIds.join(',')}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertSafeConfiguredTarget();
  dataSource.setOptions({ migrationsRun: false });

  await dataSource.initialize();
  try {
    await assertConnectedTarget();
    if (options.clear) {
      await clearFixture();
    } else {
      await seedFixture(options);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
