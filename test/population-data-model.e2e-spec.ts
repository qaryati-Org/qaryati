import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// These tests exercise the database rules of `population_records` directly,
// because the database is the last line of defense behind the API validation.
describe('population_records data model (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let villageId: string;
  let sourceId: string;
  let otherSourceId: string;
  let reviewerId: string;

  const insert = (
    value: number,
    year: number,
    status = 'PENDING',
    source = sourceId,
  ) =>
    ds.query(
      `INSERT INTO population_records (village_id, source_id, value, reference_year, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [villageId, source, value, year, status],
    );

  const cleanup = async () => {
    await ds.query(`DELETE FROM population_records WHERE village_id IN
      (SELECT id FROM villages WHERE name_ar LIKE 'E2E-POP%')`);
    await ds.query(`DELETE FROM villages WHERE name_ar LIKE 'E2E-POP%'`);
    await ds.query(`DELETE FROM sources WHERE title LIKE 'E2E-POP%'`);
    await ds.query(`DELETE FROM users WHERE display_name LIKE 'E2E-POP%'`);
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await cleanup();
    const [{ id: governorateId }] = await ds.query(
      `SELECT id FROM governorates LIMIT 1`,
    );
    [{ id: villageId }] = await ds.query(
      `INSERT INTO villages (name_ar, governorate_id) VALUES ('E2E-POP village', $1) RETURNING id`,
      [governorateId],
    );
    [{ id: sourceId }] = await ds.query(
      `INSERT INTO sources (title, type) VALUES ('E2E-POP census', 'SURVEY') RETURNING id`,
    );
    [{ id: otherSourceId }] = await ds.query(
      `INSERT INTO sources (title, type) VALUES ('E2E-POP survey', 'SURVEY') RETURNING id`,
    );
    [{ id: reviewerId }] = await ds.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ('e2e-pop-reviewer@example.test', 'not-a-real-hash', 'E2E-POP reviewer', 'VERIFIER')
       RETURNING id`,
    );
  });

  afterEach(() =>
    ds.query(`DELETE FROM population_records WHERE village_id = $1`, [
      villageId,
    ]),
  );

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('starts every record as PENDING with no review data', async () => {
    const [{ id }] = await insert(1200, 1997);
    const [row] = await ds.query(
      `SELECT status, reviewed_at, reviewed_by_id, review_note
       FROM population_records WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({
      status: 'PENDING',
      reviewed_at: null,
      reviewed_by_id: null,
      review_note: null,
    });
  });

  it('accepts a population of 0 (depopulated village)', async () => {
    await expect(insert(0, 1950)).resolves.toBeDefined();
  });

  it('rejects a negative population', async () => {
    await expect(insert(-1, 1997)).rejects.toMatchObject({
      code: '23514',
      constraint: 'chk_population_records_value_non_negative',
    });
  });

  it.each([0, 2101])('rejects reference year %i', async (year) => {
    await expect(insert(100, year)).rejects.toMatchObject({
      code: '23514',
      constraint: 'chk_population_records_year_range',
    });
  });

  it('rejects the exact same figure from the same source twice', async () => {
    await insert(1200, 1997);
    await expect(insert(1200, 1997)).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_population_records_village_year_value_source',
    });
  });

  it('stores conflicting figures for the same year side by side', async () => {
    await insert(1200, 1997, 'PENDING', sourceId);
    await insert(1350, 1997, 'PENDING', otherSourceId);
    const rows = await ds.query(
      `SELECT value FROM population_records WHERE village_id = $1 AND reference_year = 1997`,
      [villageId],
    );
    expect(rows).toHaveLength(2);
  });

  it('allows only one VERIFIED figure per village and year', async () => {
    await insert(1200, 1997, 'VERIFIED', sourceId);
    await expect(
      insert(1350, 1997, 'VERIFIED', otherSourceId),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_population_records_verified_village_year',
    });
  });

  it('allows a VERIFIED figure next to PENDING and REJECTED ones', async () => {
    await insert(1200, 1997, 'VERIFIED', sourceId);
    await insert(1350, 1997, 'PENDING', otherSourceId);
    await insert(900, 1997, 'REJECTED', sourceId);
    const [{ count }] = await ds.query(
      `SELECT count(*)::int AS count FROM population_records WHERE village_id = $1`,
      [villageId],
    );
    expect(count).toBe(3);
  });

  it('refuses to verify a second figure for the same year', async () => {
    await insert(1200, 1997, 'VERIFIED', sourceId);
    const [{ id }] = await insert(1350, 1997, 'PENDING', otherSourceId);
    await expect(
      ds.query(
        `UPDATE population_records SET status = 'VERIFIED' WHERE id = $1`,
        [id],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_population_records_verified_village_year',
    });
  });

  it('allows verifying after the old VERIFIED figure is rejected', async () => {
    const [{ id: oldId }] = await insert(1200, 1997, 'VERIFIED', sourceId);
    const [{ id: newId }] = await insert(1350, 1997, 'PENDING', otherSourceId);
    await ds.query(
      `UPDATE population_records SET status = 'REJECTED' WHERE id = $1`,
      [oldId],
    );
    await expect(
      ds.query(
        `UPDATE population_records SET status = 'VERIFIED' WHERE id = $1`,
        [newId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown village or source', async () => {
    await expect(
      ds.query(
        `INSERT INTO population_records (village_id, source_id, value, reference_year)
         VALUES ($1, $2, 10, 2000)`,
        [UNKNOWN_ID, sourceId],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'population_records_village_id_fkey',
    });
    await expect(
      ds.query(
        `INSERT INTO population_records (village_id, source_id, value, reference_year)
         VALUES ($1, $2, 10, 2000)`,
        [villageId, UNKNOWN_ID],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'population_records_source_id_fkey',
    });
  });

  it('records a reviewer that exists and rejects one that does not', async () => {
    const [{ id }] = await insert(1200, 1997);
    await ds.query(
      `UPDATE population_records SET reviewed_by_id = $1 WHERE id = $2`,
      [reviewerId, id],
    );
    const [row] = await ds.query(
      `SELECT reviewed_by_id FROM population_records WHERE id = $1`,
      [id],
    );
    expect(row.reviewed_by_id).toBe(reviewerId);

    await expect(
      ds.query(
        `UPDATE population_records SET reviewed_by_id = $1 WHERE id = $2`,
        [UNKNOWN_ID, id],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'population_records_reviewed_by_id_fkey',
    });
  });

  it('refuses to delete a source, village or reviewer that records use', async () => {
    const [{ id }] = await insert(1200, 1997);
    await ds.query(
      `UPDATE population_records SET reviewed_by_id = $1 WHERE id = $2`,
      [reviewerId, id],
    );
    await expect(
      ds.query(`DELETE FROM sources WHERE id = $1`, [sourceId]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      ds.query(`DELETE FROM villages WHERE id = $1`, [villageId]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      ds.query(`DELETE FROM users WHERE id = $1`, [reviewerId]),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
