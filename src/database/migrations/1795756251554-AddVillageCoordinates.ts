import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVillageCoordinates1795756251554 implements MigrationInterface {
  name = 'AddVillageCoordinates1795756251554';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "villages"
        ADD COLUMN "latitude" double precision,
        ADD COLUMN "longitude" double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "villages"
        DROP COLUMN "longitude",
        DROP COLUMN "latitude"
    `);
  }
}
