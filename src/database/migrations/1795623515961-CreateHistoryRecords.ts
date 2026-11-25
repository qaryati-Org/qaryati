import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHistoryRecords1795623515961 implements MigrationInterface {
  name = 'CreateHistoryRecords1795623515961';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "history_record_type" AS ENUM ('OVERVIEW', 'EVENT')
    `);

    await queryRunner.query(`
      CREATE TABLE "history_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "village_id" uuid NOT NULL,
        "source_id" uuid NOT NULL,
        "type" "history_record_type" NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "start_year" integer,
        "end_year" integer,
        "status" "verification_status" NOT NULL DEFAULT 'PENDING',
        "reviewed_at" timestamptz,
        "reviewed_by_id" uuid,
        "review_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_history_records_end_year_requires_start_year"
          CHECK ("end_year" IS NULL OR "start_year" IS NOT NULL),
        CONSTRAINT "chk_history_records_start_year_not_zero"
          CHECK ("start_year" IS NULL OR "start_year" <> 0),
        CONSTRAINT "chk_history_records_end_year_not_zero"
          CHECK ("end_year" IS NULL OR "end_year" <> 0),
        CONSTRAINT "chk_history_records_start_year_max"
          CHECK ("start_year" IS NULL OR "start_year" <= 2100),
        CONSTRAINT "chk_history_records_end_year_max"
          CHECK ("end_year" IS NULL OR "end_year" <= 2100),
        CONSTRAINT "chk_history_records_year_order"
          CHECK (
            "start_year" IS NULL OR
            "end_year" IS NULL OR
            "start_year" <= "end_year"
          ),
        CONSTRAINT "history_records_village_id_fkey"
          FOREIGN KEY ("village_id") REFERENCES "villages" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "history_records_source_id_fkey"
          FOREIGN KEY ("source_id") REFERENCES "sources" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "history_records_reviewed_by_id_fkey"
          FOREIGN KEY ("reviewed_by_id") REFERENCES "users" ("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_history_records_village_id"
        ON "history_records" ("village_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_history_records_source_id"
        ON "history_records" ("source_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_history_records_village_overview"
        ON "history_records" ("village_id")
        WHERE "type" = 'OVERVIEW'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "history_records"`);
    await queryRunner.query(`DROP TYPE "history_record_type"`);
  }
}
