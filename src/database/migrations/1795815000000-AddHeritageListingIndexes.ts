import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHeritageListingIndexes1795815000000 implements MigrationInterface {
  name = 'AddHeritageListingIndexes1795815000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_landmarks_village_status_name_id"
        ON "landmarks" ("village_id", "status", "name", "id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_landmarks_village_status_type_name_id"
        ON "landmarks" ("village_id", "status", "type", "name", "id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cultural_traits_village_status_name_id"
        ON "cultural_traits" ("village_id", "status", "name", "id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cultural_traits_village_status_type_name_id"
        ON "cultural_traits" ("village_id", "status", "type", "name", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_cultural_traits_village_status_type_name_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_cultural_traits_village_status_name_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_landmarks_village_status_type_name_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_landmarks_village_status_name_id"`,
    );
  }
}
