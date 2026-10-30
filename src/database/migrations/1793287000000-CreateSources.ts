import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSources1793287000000 implements MigrationInterface {
  name = 'CreateSources1793287000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "source_type" AS ENUM ('BOOK', 'WEBSITE', 'ARCHIVE', 'SURVEY', 'ORAL', 'OTHER')
    `);

    await queryRunner.query(`
      CREATE TABLE "sources" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(255) NOT NULL,
        "type" "source_type" NOT NULL,
        "author" varchar(255),
        "url" text,
        "year" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_sources_year_range" CHECK ("year" BETWEEN 1 AND 2100)
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sources"`);
    await queryRunner.query(`DROP TYPE "source_type"`);
  }
}
