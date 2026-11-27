import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1795812179555 implements MigrationInterface {
  name = 'CreateAuditLogs1795812179555';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "audit_action" AS ENUM ('INSERT', 'UPDATE', 'DELETE')
    `);

    // Append-only: rows are never updated, so there is no updated_at.
    // actor_id has no foreign key on purpose: the history must outlive the
    // user, and a missing user must never block the write being audited.
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "table_name" varchar(63) NOT NULL,
        "record_id" uuid NOT NULL,
        "action" "audit_action" NOT NULL,
        "actor_id" uuid,
        "correlation_id" varchar(64),
        "old_data" jsonb,
        "new_data" jsonb,
        "changed_columns" text[],
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_record"
        ON "audit_logs" ("table_name", "record_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_actor"
        ON "audit_logs" ("actor_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "audit_action"`);
  }
}
