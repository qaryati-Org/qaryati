import dataSource from '../data-source';

// npm run seed:perf                   -> adds 50,000 synthetic villages
// npm run seed:perf -- --count 20000  -> adds a chosen number
// npm run seed:perf -- --clear        -> removes all synthetic rows
//
// Synthetic data for the k6 load tests only. A few hundred real villages
// fit in memory and every query is fast, so search optimizations cannot be
// measured on them. Every synthetic village has an English name starting
// with "PERF " so it can be told apart and removed; its alternative names
// go with it (ON DELETE CASCADE).
//
// setseed() makes random() repeat the same sequence, so every run creates
// the same names and before/after measurements compare like with like.

const PERF_PREFIX = 'PERF ';
const DEFAULT_COUNT = 50_000;
const MAX_COUNT = 500_000;

// Arabic syllables combined into village-like names (for example "بيت",
// "كفر" and "دير" are common first parts of real village names).
const FIRST_PARTS = ['بيت', 'كفر', 'دير', 'عين', 'خربة', 'تل', 'وادي', 'برج'];
const SYLLABLES = [
  'بر',
  'قة',
  'سل',
  'وا',
  'دا',
  'نا',
  'ري',
  'حا',
  'جي',
  'لو',
  'عم',
  'صو',
  'طا',
  'زي',
  'فو',
  'كا',
  'مي',
  'شو',
  'تي',
  'رو',
];

function parseArgs(argv: string[]): { clear: boolean; count: number } {
  const clear = argv.includes('--clear');
  const countIndex = argv.indexOf('--count');
  const count =
    countIndex === -1 ? DEFAULT_COUNT : Number(argv[countIndex + 1]);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`--count must be an integer from 1 to ${MAX_COUNT}`);
  }
  return { clear, count };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load synthetic data with NODE_ENV=production');
  }
  const { clear, count } = parseArgs(process.argv.slice(2));

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();

    if (clear) {
      const deleted = await dataSource.query<[unknown[], number]>(
        'DELETE FROM villages WHERE name_en LIKE $1',
        [`${PERF_PREFIX}%`],
      );
      console.log(`Removed ${deleted[1]} synthetic villages.`);
      return;
    }

    await dataSource.transaction(async (manager) => {
      // Start numbering after any synthetic rows already present, so the
      // script can be run again to add more.
      const [{ existing }] = await manager.query<{ existing: number }[]>(
        'SELECT count(*)::int AS existing FROM villages WHERE name_en LIKE $1',
        [`${PERF_PREFIX}%`],
      );
      // Same session as the INSERT below (inside the transaction).
      await manager.query('SELECT setseed(0.42)');

      // The number in the Arabic name keeps (governorate, name_ar) unique.
      const villages = await manager.query<unknown[]>(
        `INSERT INTO villages (name_ar, name_en, governorate_id)
         SELECT
           ($1::text[])[1 + floor(random() * cardinality($1::text[]))::int]
             || ' '
             || ($2::text[])[1 + floor(random() * cardinality($2::text[]))::int]
             || ($2::text[])[1 + floor(random() * cardinality($2::text[]))::int]
             || ' ' || i,
           $3::text || 'Village ' || i,
           g.ids[1 + (i % cardinality(g.ids))]
         FROM generate_series($4::int + 1, $4::int + $5::int) AS i,
              (SELECT array_agg(id ORDER BY name_en) AS ids
               FROM governorates) AS g
         RETURNING id`,
        [FIRST_PARTS, SYLLABLES, PERF_PREFIX, existing, count],
      );

      // One transliteration per synthetic village, so the search also has
      // to scan a large village_names table.
      const names = await manager.query<unknown[]>(
        `INSERT INTO village_names (village_id, name, type, language)
         SELECT v.id, replace(v.name_en, $2, 'Perf Translit '),
                'TRANSLITERATION', 'en'
         FROM villages v
         WHERE v.name_en LIKE $1
           AND NOT EXISTS (
             SELECT 1 FROM village_names n WHERE n.village_id = v.id)
         RETURNING id`,
        [`${PERF_PREFIX}%`, `${PERF_PREFIX}Village `],
      );

      console.log(
        `Added ${villages.length} synthetic villages and ${names.length} alternative names (${existing + villages.length} synthetic villages in total).`,
      );
    });

    // Fresh statistics so the planner sees the new table sizes right away.
    await dataSource.query('ANALYZE villages');
    await dataSource.query('ANALYZE village_names');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
