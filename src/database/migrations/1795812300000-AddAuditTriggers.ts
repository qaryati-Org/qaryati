import { MigrationInterface, QueryRunner } from 'typeorm';

// Tables whose changes are written to audit_logs. A new table with data that
// people create or edit should be added here in a new migration.
// Not audited: refresh_tokens (security noise, and it holds token hashes),
// audit_logs itself, and the governorate/municipality reference data.
const AUDITED_TABLES = [
  'villages',
  'village_names',
  'sources',
  'population_records',
  'history_records',
  'landmarks',
  'cultural_traits',
  'users',
] as const;

// Columns whose values are never copied into the audit log. Their names
// still appear in changed_columns, so a change is visible but not its value.
const SECRET_COLUMNS = ['password_hash'];

export class AddAuditTriggers1795812300000 implements MigrationInterface {
  name = 'AddAuditTriggers1795812300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const secrets = `ARRAY[${SECRET_COLUMNS.map((c) => `'${c}'`).join(', ')}]`;

    // Runs after every row change, whatever wrote it: repository save(),
    // update() / delete() with a WHERE condition, or raw SQL. The caller is
    // read from the qaryati.actor_id / qaryati.correlation_id settings that
    // the API sets on the connection right before each write
    // (AuditActorSubscriber); outside a request they are empty, stored as NULL.
    await queryRunner.query(`
      CREATE FUNCTION audit_log_row() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        full_old jsonb;
        full_new jsonb;
        changed text[];
      BEGIN
        IF TG_OP <> 'INSERT' THEN full_old := to_jsonb(OLD); END IF;
        IF TG_OP <> 'DELETE' THEN full_new := to_jsonb(NEW); END IF;

        IF TG_OP = 'UPDATE' THEN
          SELECT array_agg(n.key ORDER BY n.key) INTO changed
          FROM jsonb_each(full_new) AS n
          WHERE n.key <> 'updated_at'
            AND n.value IS DISTINCT FROM full_old -> n.key;
          -- Nothing but updated_at changed: not worth a history entry.
          IF changed IS NULL THEN RETURN NULL; END IF;
        END IF;

        INSERT INTO audit_logs (
          table_name, record_id, action, actor_id, correlation_id,
          old_data, new_data, changed_columns
        ) VALUES (
          TG_TABLE_NAME,
          (COALESCE(full_new, full_old) ->> 'id')::uuid,
          TG_OP::audit_action,
          NULLIF(current_setting('qaryati.actor_id', true), '')::uuid,
          NULLIF(current_setting('qaryati.correlation_id', true), ''),
          full_old - ${secrets},
          full_new - ${secrets},
          changed
        );
        RETURN NULL;
      END;
      $$
    `);

    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`
        CREATE TRIGGER "audit_${table}"
          AFTER INSERT OR UPDATE OR DELETE ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION audit_log_row()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`DROP TRIGGER "audit_${table}" ON "${table}"`);
    }
    await queryRunner.query(`DROP FUNCTION audit_log_row()`);
  }
}
