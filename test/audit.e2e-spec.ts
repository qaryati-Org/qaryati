import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { callerWithRole, httpAs, TestCaller } from './utils/auth';
import { createTestApp } from './utils/create-test-app';

interface AuditRow {
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  correlation_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_columns: string[] | null;
}

// Covers every way the modules write: repository save(), update() and
// delete() with a WHERE condition, raw SQL (population review), and an
// anonymous sign-up.
describe('Audit log (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let admin: TestCaller;
  let editor: TestCaller;
  let verifier: TestCaller;
  const run = randomUUID().slice(0, 8);
  const correlation = (step: string) => `e2e-audit-${run}-${step}`;
  const fixture = { governorate: randomUUID(), village: randomUUID() };
  const registeredEmail = `e2e-audit-${run}@example.com`;

  const auditRows = (correlationId: string) =>
    ds.query<AuditRow[]>(
      `SELECT table_name, record_id, action, actor_id, correlation_id,
              old_data, new_data, changed_columns
       FROM audit_logs WHERE correlation_id = $1 ORDER BY created_at`,
      [correlationId],
    );

  const path = (rest: string) => `/api/v1/villages/${fixture.village}${rest}`;

  async function createSource(caller: TestCaller, step: string) {
    const res = await httpAs(app, caller)
      .post('/api/v1/sources')
      .set('x-correlation-id', correlation(step))
      .send({ title: `E2E-AUDIT ${run} ${step}`, type: 'BOOK' })
      .expect(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    admin = await callerWithRole(app, Role.ADMIN);
    editor = await callerWithRole(app, Role.EDITOR);
    verifier = await callerWithRole(app, Role.VERIFIER);

    await ds.query(
      `INSERT INTO governorates (id, name_ar, name_en) VALUES ($1, $2, $3)`,
      [fixture.governorate, `E2E-AUDIT-${run}`, `E2E Audit ${run}`],
    );
    await ds.query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixture.village,
        `E2E-AUDIT-${run}-village`,
        `E2E Audit Village ${run}`,
        fixture.governorate,
      ],
    );
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM landmarks WHERE village_id = $1`, [
      fixture.village,
    ]);
    await ds.query(`DELETE FROM population_records WHERE village_id = $1`, [
      fixture.village,
    ]);
    await ds.query(`DELETE FROM sources WHERE title LIKE $1`, [
      `E2E-AUDIT ${run}%`,
    ]);
    await ds.query(`DELETE FROM villages WHERE id = $1`, [fixture.village]);
    await ds.query(`DELETE FROM governorates WHERE id = $1`, [
      fixture.governorate,
    ]);
    await ds.query(`DELETE FROM users WHERE email = $1`, [registeredEmail]);
    await ds.query(
      `DELETE FROM audit_logs
       WHERE correlation_id LIKE $1
          OR record_id::text IN ($2, $3)
          OR new_data ->> 'title' LIKE $4
          OR old_data ->> 'title' LIKE $4
          OR new_data ->> 'email' = $5
          OR old_data ->> 'email' = $5
          OR new_data ->> 'village_id' = $3
          OR old_data ->> 'village_id' = $3`,
      [
        `e2e-audit-${run}-%`,
        fixture.governorate,
        fixture.village,
        `E2E-AUDIT ${run}%`,
        registeredEmail,
      ],
    );
    await app.close();
  });

  it('records an insert with the caller, correlation id and new values', async () => {
    const sourceId = await createSource(editor, 'insert');

    const [row] = await auditRows(correlation('insert'));
    expect(row).toMatchObject({
      table_name: 'sources',
      record_id: sourceId,
      action: 'INSERT',
      actor_id: editor.userId,
      old_data: null,
      changed_columns: null,
    });
    expect(row.new_data).toMatchObject({ title: `E2E-AUDIT ${run} insert` });
  });

  it('records update() with a WHERE condition: before, after and changed columns', async () => {
    const sourceId = await createSource(editor, 'landmark-source');
    const created = await httpAs(app, editor)
      .post(path('/landmarks'))
      .send({
        name: 'Old spring',
        type: 'SPRING',
        description: 'First text',
        sourceId,
      })
      .expect(201);

    await httpAs(app, editor)
      .patch(path(`/landmarks/${created.body.id}`))
      .set('x-correlation-id', correlation('update'))
      .send({ description: 'Corrected text' })
      .expect(200);

    const rows = await auditRows(correlation('update'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      table_name: 'landmarks',
      record_id: created.body.id,
      action: 'UPDATE',
      actor_id: editor.userId,
      changed_columns: ['description'],
    });
    expect(rows[0].old_data).toMatchObject({ description: 'First text' });
    expect(rows[0].new_data).toMatchObject({ description: 'Corrected text' });
  });

  it('records delete() with a WHERE condition and the deleted values', async () => {
    const sourceId = await createSource(editor, 'delete-source');
    const created = await httpAs(app, editor)
      .post(path('/landmarks'))
      .send({
        name: 'To delete',
        type: 'VIEWPOINT',
        description: 'x',
        sourceId,
      })
      .expect(201);

    await httpAs(app, admin)
      .delete(path(`/landmarks/${created.body.id}`))
      .set('x-correlation-id', correlation('delete'))
      .expect(204);

    const [row] = await auditRows(correlation('delete'));
    expect(row).toMatchObject({
      table_name: 'landmarks',
      record_id: created.body.id,
      action: 'DELETE',
      actor_id: admin.userId,
      new_data: null,
    });
    expect(row.old_data).toMatchObject({ name: 'To delete' });
  });

  it('records a review done with raw SQL, with the verifier as the actor', async () => {
    const sourceId = await createSource(editor, 'population-source');
    const created = await httpAs(app, editor)
      .post(path('/population-records'))
      .send({ value: 1500, referenceYear: 1997, sourceId })
      .expect(201);

    await httpAs(app, verifier)
      .post(path(`/population-records/${created.body.id}/verify`))
      .set('x-correlation-id', correlation('verify'))
      .send({ reviewNote: 'Matches the census' })
      .expect(200);

    const [row] = await auditRows(correlation('verify'));
    expect(row).toMatchObject({
      table_name: 'population_records',
      record_id: created.body.id,
      action: 'UPDATE',
      actor_id: verifier.userId,
    });
    expect(row.changed_columns).toEqual(
      expect.arrayContaining(['status', 'reviewed_by_id', 'review_note']),
    );
    expect(row.old_data).toMatchObject({ status: 'PENDING' });
    expect(row.new_data).toMatchObject({ status: 'VERIFIED' });
  });

  it('records an anonymous sign-up without an actor and without the password hash', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('x-correlation-id', correlation('register'))
      .send({
        email: registeredEmail,
        password: 'a long enough password',
        displayName: 'Audit',
      })
      .expect(201);

    const rows = await auditRows(correlation('register'));
    expect(rows.map((r) => r.table_name)).toEqual(['users']);
    expect(rows[0].actor_id).toBeNull();
    expect(rows[0].new_data).toMatchObject({ email: registeredEmail });
    expect(rows[0].new_data).not.toHaveProperty('password_hash');
    expect(JSON.stringify(rows[0])).not.toContain('$argon2');
  });

  it('keeps each concurrent request attributed to its own caller', async () => {
    const callers = [
      editor,
      admin,
      editor,
      admin,
      editor,
      admin,
      editor,
      admin,
    ];
    await Promise.all(
      callers.map((caller, i) => createSource(caller, `concurrent-${i}`)),
    );

    for (const [i, caller] of callers.entries()) {
      const [row] = await auditRows(correlation(`concurrent-${i}`));
      expect(row.actor_id).toBe(caller.userId);
    }
  });

  describe('GET /api/v1/audit-logs', () => {
    it('is ADMIN only', async () => {
      await request(app.getHttpServer()).get('/api/v1/audit-logs').expect(401);
      await httpAs(app, editor).get('/api/v1/audit-logs').expect(403);
      await httpAs(app, verifier).get('/api/v1/audit-logs').expect(403);
    });

    it('returns the history of one record, newest first', async () => {
      const sourceId = await createSource(editor, 'history');
      await httpAs(app, editor)
        .patch(`/api/v1/sources/${sourceId}`)
        .send({ title: `E2E-AUDIT ${run} history renamed` })
        .expect(200);

      const res = await httpAs(app, admin)
        .get('/api/v1/audit-logs')
        .query({ tableName: 'sources', recordId: sourceId })
        .expect(200);

      expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
      expect(res.body.data.map((r: AuditRow) => r.action)).toEqual([
        'UPDATE',
        'INSERT',
      ]);
      expect(res.body.data[0]).toMatchObject({
        tableName: 'sources',
        recordId: sourceId,
        actorId: editor.userId,
        changedColumns: ['title'],
      });
    });

    it('filters by actor and action', async () => {
      const res = await httpAs(app, admin)
        .get('/api/v1/audit-logs')
        .query({ actorId: verifier.userId, action: 'UPDATE', limit: 100 })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const row of res.body.data) {
        expect(row).toMatchObject({
          actorId: verifier.userId,
          action: 'UPDATE',
        });
      }
    });

    it('rejects invalid filters', async () => {
      const res = await httpAs(app, admin)
        .get('/api/v1/audit-logs')
        .query({ recordId: 'nope', action: 'TRUNCATE' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
