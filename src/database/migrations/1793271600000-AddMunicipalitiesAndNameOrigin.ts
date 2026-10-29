import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMunicipalitiesAndNameOrigin1793271600000 implements MigrationInterface {
  name = 'AddMunicipalitiesAndNameOrigin1793271600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "municipality_type" AS ENUM ('MUNICIPALITY', 'VILLAGE_COUNCIL')`,
    );

    await queryRunner.query(`
      CREATE TABLE "municipalities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name_ar" varchar(150) NOT NULL,
        "name_en" varchar(150),
        "type" "municipality_type" NOT NULL,
        "governorate_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "municipalities_governorate_id_fkey" FOREIGN KEY ("governorate_id")
          REFERENCES "governorates"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_municipalities_governorate_name_ar" UNIQUE ("governorate_id", "name_ar"),
        CONSTRAINT "uq_municipalities_id_governorate" UNIQUE ("id", "governorate_id")
      )`);

    await queryRunner.query(`
      ALTER TABLE "villages"
        ADD COLUMN "name_origin" text,
        ADD COLUMN "municipality_id" uuid`);

    // Composite FK: a village's municipality must belong to the same
    // governorate as the village. With MATCH SIMPLE (the default) the check
    // is skipped while municipality_id is NULL.
    await queryRunner.query(`
      ALTER TABLE "villages"
        ADD CONSTRAINT "villages_municipality_same_governorate_fkey"
        FOREIGN KEY ("municipality_id", "governorate_id")
        REFERENCES "municipalities"("id", "governorate_id") ON DELETE RESTRICT`);

    await queryRunner.query(
      `CREATE INDEX "idx_villages_municipality_id" ON "villages" ("municipality_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_villages_municipality_id"`);
    await queryRunner.query(`
      ALTER TABLE "villages"
        DROP CONSTRAINT "villages_municipality_same_governorate_fkey",
        DROP COLUMN "municipality_id",
        DROP COLUMN "name_origin"`);
    await queryRunner.query(`DROP TABLE "municipalities"`);
    await queryRunner.query(`DROP TYPE "municipality_type"`);
  }
}
