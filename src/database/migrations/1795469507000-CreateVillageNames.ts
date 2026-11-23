import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVillageNames1795469507000 implements MigrationInterface {
  name = 'CreateVillageNames1795469507000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "village_name_type"
        AS ENUM ('ALTERNATIVE_SPELLING', 'TRANSLITERATION', 'HISTORICAL')`);

    await queryRunner.query(`
      CREATE TABLE "village_names" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "village_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "type" "village_name_type" NOT NULL,
        "language" varchar(2) NOT NULL,
        "period" varchar(100),
        "note" text,
        "source_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_village_names_language"
          CHECK ("language" ~ '^[a-z]{2}$'),
        CONSTRAINT "uq_village_names_village_name"
          UNIQUE ("village_id", "name"),
        CONSTRAINT "village_names_village_id_fkey"
          FOREIGN KEY ("village_id") REFERENCES "villages" ("id")
          ON DELETE CASCADE,
        CONSTRAINT "village_names_source_id_fkey"
          FOREIGN KEY ("source_id") REFERENCES "sources" ("id")
          ON DELETE RESTRICT
      )`);

    await queryRunner.query(
      `CREATE INDEX "idx_village_names_source_id" ON "village_names" ("source_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "village_names"`);
    await queryRunner.query(`DROP TYPE "village_name_type"`);
  }
}
