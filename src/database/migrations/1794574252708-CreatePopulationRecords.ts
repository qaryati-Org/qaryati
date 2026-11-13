import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePopulationRecords1794574252708 implements MigrationInterface {
  name = 'CreatePopulationRecords1794574252708';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "population_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "village_id" uuid NOT NULL,
        "source_id" uuid NOT NULL,
        "value" integer NOT NULL,
        "reference_year" integer NOT NULL,
        "status" "verification_status" NOT NULL DEFAULT 'PENDING',
        "reviewed_at" timestamptz,
        "reviewed_by_id" uuid,
        "review_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_population_records_value_non_negative"
          CHECK ("value" >= 0),
        CONSTRAINT "chk_population_records_year_range"
          CHECK ("reference_year" BETWEEN 1 AND 2100),
        CONSTRAINT "uq_population_records_village_year_value_source"
          UNIQUE ("village_id", "reference_year", "value", "source_id"),
        CONSTRAINT "population_records_village_id_fkey"
          FOREIGN KEY ("village_id") REFERENCES "villages" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "population_records_source_id_fkey"
          FOREIGN KEY ("source_id") REFERENCES "sources" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "population_records_reviewed_by_id_fkey"
          FOREIGN KEY ("reviewed_by_id") REFERENCES "users" ("id")
          ON DELETE RESTRICT
      )`);

    // Partial unique index: only one VERIFIED figure per village and year.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_population_records_verified_village_year"
        ON "population_records" ("village_id", "reference_year")
        WHERE "status" = 'VERIFIED'`);

    await queryRunner.query(
      `CREATE INDEX "idx_population_records_source_id" ON "population_records" ("source_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "population_records"`);
  }
}
