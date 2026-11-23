import { MigrationInterface, QueryRunner } from 'typeorm';

// The review status shared by every table whose records go through review
// (population, history, heritage). It has its own migration so no table's
// migration creates or drops it: tables only use it.
export class CreateVerificationStatusType1794574251708 implements MigrationInterface {
  name = 'CreateVerificationStatusType1794574251708';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "verification_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TYPE "verification_status"`);
  }
}
