import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

// Test villages use a made-up token in their names so searches only hit the
// rows created here, even if the database holds real or seed data.
const TOKEN = 'زقزق';
const PREFIX = 'E2E-VS';

interface Result {
  nameAr: string;
  nameEn: string | null;
  matchedName: string;
  matchedBy: string;
  match: string;
  governorate: { id: string; nameEn: string };
}

describe('Village search (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let nablusId: string;
  let jeninId: string;

  const search = (params: Record<string, string | number>) =>
    request(app.getHttpServer()).get('/api/v1/villages/search').query(params);

  const names = (body: unknown): string[] =>
    (body as { data: Result[] }).data.map((r) => r.nameAr);

  const cleanup = () =>
    ds.query(`DELETE FROM villages WHERE name_en LIKE '${PREFIX}%'`);

  const insertVillage = async (
    nameAr: string,
    nameEn: string,
    governorateId: string,
  ): Promise<string> => {
    const [{ id }]: { id: string }[] = await ds.query(
      `INSERT INTO villages (name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [nameAr, `${PREFIX} ${nameEn}`, governorateId],
    );
    return id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await cleanup();

    [{ id: nablusId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
    );
    [{ id: jeninId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Jenin'`,
    );

    // Exact, prefix and contains matches for the token, in two governorates.
    const exact = await insertVillage(TOKEN, 'Exact', nablusId);
    // A second matching name on the same village: it must still appear once,
    // with its best (exact) match.
    await ds.query(
      `INSERT INTO village_names (village_id, name, type, language)
       VALUES ($1, $2, 'ALTERNATIVE_SPELLING', 'ar')`,
      [exact, `${TOKEN}ي`],
    );
    await insertVillage(`${TOKEN} الشرقية`, 'Prefix', nablusId);
    await insertVillage(`عين ${TOKEN}`, 'Contains', jeninId);
    // Arabic letter variants: stored with hamza and taa marbuta.
    await insertVillage(`أم ${TOKEN}ة`, 'Variants', jeninId);
    // Only reachable through an alternative name.
    const renamed = await insertVillage('قرية جديدة', 'Renamed', nablusId);
    await ds.query(
      `INSERT INTO village_names (village_id, name, type, language)
       VALUES ($1, $2, 'HISTORICAL', 'ar'), ($1, 'Zaqzuq', 'TRANSLITERATION', 'en')`,
      [renamed, `خربة ${TOKEN}`],
    );
    // Literal wildcard characters in a name.
    await insertVillage(`${TOKEN} 100%`, 'Percent', jeninId);
  });

  afterAll(async () => {
    await cleanup(); // village_names are removed by ON DELETE CASCADE
    await app.close();
  });

  it('ranks exact matches first, then prefix, then contains', async () => {
    const res = await search({ q: TOKEN }).expect(200);
    const body = res.body as { data: Result[]; meta: { total: number } };

    expect(body.meta.total).toBe(6);
    expect(body.data[0]).toMatchObject({ nameAr: TOKEN, match: 'EXACT' });
    expect(body.data.slice(1, 3).map((r) => r.match)).toEqual([
      'PREFIX',
      'PREFIX',
    ]);
    expect(body.data.slice(3).every((r) => r.match === 'CONTAINS')).toBe(true);
  });

  it('finds a village through its alternative names and says which matched', async () => {
    const res = await search({ q: 'zaqzu' }).expect(200);

    expect(res.body.data).toEqual([
      expect.objectContaining({
        nameAr: 'قرية جديدة',
        matchedName: 'Zaqzuq',
        matchedBy: 'TRANSLITERATION',
        match: 'PREFIX',
      }),
    ]);
  });

  it('returns each village once even when several of its names match', async () => {
    const res = await search({ q: TOKEN }).expect(200);

    expect(names(res.body)).toEqual([...new Set(names(res.body))]);
  });

  it('ignores Arabic letter variants (ا/أ, ه/ة)', async () => {
    const res = await search({ q: `ام ${TOKEN}ه` }).expect(200);

    expect(names(res.body)).toEqual([`أم ${TOKEN}ة`]);
  });

  it('ignores Latin case', async () => {
    const res = await search({ q: 'ZAQZUQ' }).expect(200);

    expect(res.body.data[0]).toMatchObject({ match: 'EXACT' });
  });

  it('treats % and _ as normal characters', async () => {
    const percent = await search({ q: '100%' }).expect(200);
    expect(names(percent.body)).toEqual([`${TOKEN} 100%`]);

    const underscore = await search({ q: `${TOKEN}_` }).expect(200);
    expect(underscore.body.data).toHaveLength(0);
  });

  it('filters by governorate', async () => {
    const res = await search({ q: TOKEN, governorateId: jeninId }).expect(200);

    expect(
      (res.body.data as Result[]).every((r) => r.governorate.id === jeninId),
    ).toBe(true);
    expect(res.body.meta.total).toBe(3);
  });

  it('paginates with the usual meta', async () => {
    const res = await search({ q: TOKEN, limit: 2, page: 2 }).expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({
      page: 2,
      limit: 2,
      total: 6,
      totalPages: 3,
    });
  });

  it('returns an empty page past the end with the real total', async () => {
    const res = await search({ q: TOKEN, page: 50 }).expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(6);
  });

  it.each([
    ['missing q', {}],
    ['one character', { q: 'ز' }],
    ['only spaces', { q: '   ' }],
    ['too long q', { q: 'x'.repeat(101) }],
    ['bad governorateId', { q: TOKEN, governorateId: 'abc' }],
    ['unsupported sort', { q: TOKEN, sort: 'nameAr' }],
  ])('returns 400 for %s', async (_case, params) => {
    const res = await search(params).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is not confused with GET /villages/:id', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/villages/not-a-uuid')
      .expect(400);
  });
});
