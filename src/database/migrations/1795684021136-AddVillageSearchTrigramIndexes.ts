import { MigrationInterface, QueryRunner } from 'typeorm';

// Trigram indexes for GET /villages/search (see docs/performance/search.md).
//
// The search filters with `normalized(name) LIKE '%text%'`. A normal B-tree
// index cannot serve a pattern that starts with '%', so PostgreSQL read every
// village and every alternative name on each request. A GIN index with
// pg_trgm stores the three-letter pieces of each name and finds the rows that
// contain all pieces of the search text, wherever they are in the name.
//
// Each index is built on exactly the expression the query filters on
// (normalize() in village-search.service.ts); otherwise the planner cannot
// use it. The expression is written out here on purpose: a migration must
// not change when application code changes later.
const normalized = (column: string): string =>
  `translate(lower(${column}), 'أإآٱىة', 'اااايه')`;

export class AddVillageSearchTrigramIndexes1795684021136 implements MigrationInterface {
  name = 'AddVillageSearchTrigramIndexes1795684021136';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pg_trgm ships with PostgreSQL and is a trusted extension, so the
    // database owner can enable it without superuser rights.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.query(`
      CREATE INDEX "idx_villages_name_ar_trgm" ON "villages"
        USING gin ((${normalized('"name_ar"')}) gin_trgm_ops)`);
    await queryRunner.query(`
      CREATE INDEX "idx_villages_name_en_trgm" ON "villages"
        USING gin ((${normalized('"name_en"')}) gin_trgm_ops)`);
    await queryRunner.query(`
      CREATE INDEX "idx_village_names_name_trgm" ON "village_names"
        USING gin ((${normalized('"name"')}) gin_trgm_ops)`);

    // Statistics on the indexed expressions, so the planner can estimate how
    // many rows a search matches and choose the index right away.
    await queryRunner.query(`ANALYZE "villages"`);
    await queryRunner.query(`ANALYZE "village_names"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_village_names_name_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_villages_name_en_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_villages_name_ar_trgm"`);
    // The extension is left installed: other objects may use it by then,
    // and dropping it would fail or remove them.
  }
}
