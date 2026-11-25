import dataSource from '../data-source';
import {
  REFERENCE_VILLAGE_NAMES,
  REFERENCE_VILLAGES,
} from './reference-villages';

// npm run seed
// Inserts the reference villages and their alternative names. Safe to run
// any number of times: existing rows are kept (ON CONFLICT DO NOTHING), so
// it never overwrites data that was edited through the API.
async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();

    const villages = Object.entries(REFERENCE_VILLAGES).flatMap(
      ([governorate, list]) => list.map((v) => ({ governorate, ...v })),
    );

    await dataSource.transaction(async (manager) => {
      // Fail loudly on a governorate name that does not exist, instead of
      // silently skipping its villages in the join below.
      const known = await manager.query<{ name_en: string }[]>(
        'SELECT name_en FROM governorates',
      );
      const knownNames = new Set(known.map((g) => g.name_en));
      const unknown = Object.keys(REFERENCE_VILLAGES).filter(
        (name) => !knownNames.has(name),
      );
      if (unknown.length > 0) {
        throw new Error(`Unknown governorates: ${unknown.join(', ')}`);
      }

      const insertedVillages = await manager.query<unknown[]>(
        `INSERT INTO villages (name_ar, name_en, name_origin, governorate_id)
         SELECT d.name_ar, d.name_en, d.name_origin, g.id
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
              AS d(name_ar, name_en, name_origin, governorate)
         JOIN governorates g ON g.name_en = d.governorate
         ON CONFLICT ON CONSTRAINT uq_villages_governorate_name_ar DO NOTHING
         RETURNING id`,
        [
          villages.map((v) => v.nameAr),
          villages.map((v) => v.nameEn),
          villages.map((v) => v.nameOrigin ?? null),
          villages.map((v) => v.governorate),
        ],
      );

      const names = REFERENCE_VILLAGE_NAMES;
      const insertedNames = await manager.query<unknown[]>(
        `INSERT INTO village_names (village_id, name, type, language, period)
         SELECT v.id, d.name, d.type::village_name_type, d.language, d.period
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                     $5::text[], $6::text[])
              AS d(governorate, village_ar, name, type, language, period)
         JOIN governorates g ON g.name_en = d.governorate
         JOIN villages v ON v.governorate_id = g.id AND v.name_ar = d.village_ar
         ON CONFLICT ON CONSTRAINT uq_village_names_village_name DO NOTHING
         RETURNING id`,
        [
          names.map((n) => n.governorate),
          names.map((n) => n.villageAr),
          names.map((n) => n.name),
          names.map((n) => n.type),
          names.map((n) => n.language),
          names.map((n) => n.period ?? null),
        ],
      );

      console.log(
        `Villages: ${insertedVillages.length} inserted, ${villages.length - insertedVillages.length} already present.`,
      );
      console.log(
        `Alternative names: ${insertedNames.length} inserted, ${names.length - insertedNames.length} already present.`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
