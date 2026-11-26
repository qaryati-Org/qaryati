import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLandmarks1795710251794 implements MigrationInterface {
  name = 'CreateLandmarks1795710251794';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "landmark_type" AS ENUM (
        'SPRING',
        'RELIGIOUS_SITE',
        'ARCHAEOLOGICAL_SITE',
        'OLD_BUILDING',
        'VIEWPOINT'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "landmarks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "village_id" uuid NOT NULL,
        "source_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "type" "landmark_type" NOT NULL,
        "description" text NOT NULL,
        "status" "verification_status" NOT NULL DEFAULT 'PENDING',
        "reviewed_at" timestamptz,
        "reviewed_by_id" uuid,
        "review_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "landmarks_village_id_fkey"
          FOREIGN KEY ("village_id") REFERENCES "villages" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "landmarks_source_id_fkey"
          FOREIGN KEY ("source_id") REFERENCES "sources" ("id")
          ON DELETE RESTRICT,
        CONSTRAINT "landmarks_reviewed_by_id_fkey"
          FOREIGN KEY ("reviewed_by_id") REFERENCES "users" ("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_landmarks_village_id"
        ON "landmarks" ("village_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_landmarks_source_id"
        ON "landmarks" ("source_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "landmarks"`);
    await queryRunner.query(`DROP TYPE "landmark_type"`);
  }
}
