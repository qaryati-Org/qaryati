import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCulturalTraits1795714188328 implements MigrationInterface {
  name = 'CreateCulturalTraits1795714188328';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "cultural_trait_type" AS ENUM (
        'CRAFT',
        'FOOD',
        'FARMING_PRACTICE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cultural_traits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "village_id" uuid NOT NULL,
        "source_id" uuid NOT NULL,
        "type" "cultural_trait_type" NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "status" "verification_status" NOT NULL DEFAULT 'PENDING',
        "reviewed_at" timestamptz,
        "reviewed_by_id" uuid,
        "review_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "cultural_traits_village_id_fkey"
          FOREIGN KEY ("village_id") REFERENCES "villages" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "cultural_traits_source_id_fkey"
          FOREIGN KEY ("source_id") REFERENCES "sources" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "cultural_traits_reviewed_by_id_fkey"
          FOREIGN KEY ("reviewed_by_id") REFERENCES "users" ("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_cultural_traits_village_id"
        ON "cultural_traits" ("village_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cultural_traits_source_id"
        ON "cultural_traits" ("source_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cultural_traits"`);
    await queryRunner.query(`DROP TYPE "cultural_trait_type"`);
  }
}
