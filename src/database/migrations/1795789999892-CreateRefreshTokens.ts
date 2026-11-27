import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1795789999892 implements MigrationInterface {
  name = 'CreateRefreshTokens1795789999892';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" char(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
