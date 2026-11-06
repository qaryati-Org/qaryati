import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1793817463878 implements MigrationInterface {
  name = 'CreateUsers1793817463878';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM ('VIEWER', 'EDITOR', 'VERIFIER', 'ADMIN')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "display_name" varchar(100) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'VIEWER',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "chk_users_email_lowercase" CHECK ("email" = lower("email"))
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
