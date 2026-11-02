import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

const PREFIX = 'E2E-SRC';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Sources (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;

  const cleanup = async () => {
    await ds.query(`DELETE FROM sources WHERE title LIKE '${PREFIX}%'`);
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await ds.query(`DROP TABLE IF EXISTS e2e_source_refs`);
    await cleanup();
    await ds.query(`
      CREATE TABLE e2e_source_refs (
        id serial PRIMARY KEY,
        source_id uuid NOT NULL REFERENCES sources(id) ON DELETE RESTRICT
      )`);
  });

  afterAll(async () => {
    await ds.query(`DROP TABLE IF EXISTS e2e_source_refs`);
    await cleanup();
    await app.close();
  });

  describe('POST /api/v1/sources', () => {
    it('creates a source with omitted optional fields set to null', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({ title: `${PREFIX} Census`, type: 'WEBSITE' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: `${PREFIX} Census`,
        type: 'WEBSITE',
        author: null,
        url: null,
        year: null,
      });
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('rejects missing title, unknown type and invalid URL with field details', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({ type: 'PODCAST', url: 'not-a-url' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = res.body.error.details.map(
        (detail: { field: string }) => detail.field,
      );
      expect(fields).toEqual(expect.arrayContaining(['title', 'type', 'url']));
    });

    it('rejects a lowercase source type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({ title: `${PREFIX} Lowercase`, type: 'book' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each([0, -5, 3000])(
      'rejects publication year %i outside the accepted range',
      async (year) => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sources')
          .send({ title: `${PREFIX} Invalid year ${year}`, type: 'BOOK', year })
          .expect(400);

        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({
          title: `${PREFIX} Unknown property`,
          type: 'BOOK',
          unexpected: true,
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/sources', () => {
    beforeAll(async () => {
      await ds.query(
        `INSERT INTO sources (title, type, author, year) VALUES
         ('${PREFIX} Book A', 'BOOK', 'Author One', 1985),
         ('${PREFIX} Book B', 'BOOK', 'Author Two', 1990),
         ('${PREFIX} Website', 'WEBSITE', NULL, 2020),
         ('${PREFIX} 100% Official', 'ARCHIVE', NULL, 2001)`,
      );
    });

    it('filters by type and paginates results', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources?q=${PREFIX}&type=BOOK&limit=1&page=2`)
        .expect(200);

      expect(res.body.meta).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(res.body.data).toHaveLength(1);
    });

    it('sorts by year descending with unknown years last', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources?q=${PREFIX}&sort=year&order=desc`)
        .expect(200);

      expect(
        res.body.data.map((source: { year: number | null }) => source.year),
      ).toEqual([2020, 2001, 1990, 1985, null]);
    });

    it('filters by exact year', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources?q=${PREFIX}&year=1990`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe(`${PREFIX} Book B`);
    });

    it('searches by author and treats percent as a literal character', async () => {
      const author = await request(app.getHttpServer())
        .get('/api/v1/sources?q=Author%20Two')
        .expect(200);
      expect(author.body.data[0].title).toBe(`${PREFIX} Book B`);

      const percent = await request(app.getHttpServer())
        .get(`/api/v1/sources?q=${encodeURIComponent('100%')}`)
        .expect(200);
      expect(percent.body.meta.total).toBe(1);
      expect(percent.body.data[0].title).toBe(`${PREFIX} 100% Official`);
    });

    it.each([
      ['sort', 'password'],
      ['type', 'podcast'],
      ['limit', '101'],
    ])('rejects invalid query parameter %s=%s', async (key, value) => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources?${key}=${value}`)
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET, PATCH and DELETE /api/v1/sources/:id', () => {
    let sourceId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({
          title: `${PREFIX} Lifecycle`,
          type: 'WEBSITE',
          author: 'Lifecycle Author',
          url: 'https://example.com',
          year: 2000,
        })
        .expect(201);
      sourceId = res.body.id;
    });

    it('gets a source by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources/${sourceId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: sourceId,
        title: `${PREFIX} Lifecycle`,
        author: 'Lifecycle Author',
        year: 2000,
      });
    });

    it('returns 400 for malformed IDs and 404 for unknown UUIDs', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/sources/not-a-uuid')
        .expect(400);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources/${UNKNOWN_ID}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('patches one field without changing other fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/sources/${sourceId}`)
        .send({ year: 1999 })
        .expect(200);

      expect(res.body).toMatchObject({
        title: `${PREFIX} Lifecycle`,
        type: 'WEBSITE',
        author: 'Lifecycle Author',
        url: 'https://example.com',
        year: 1999,
      });
    });

    it('clears an optional field when explicitly set to null', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/sources/${sourceId}`)
        .send({ author: null })
        .expect(200);

      expect(res.body.author).toBeNull();
    });

    it.each([
      [{ title: null }, 'null title'],
      [{ type: null }, 'null type'],
      [{ year: 3000 }, 'out-of-range year'],
    ])('rejects a patch with %s', async (body) => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/sources/${sourceId}`)
        .send(body)
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when patching or deleting an unknown source', async () => {
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/sources/${UNKNOWN_ID}`)
        .send({ year: 1999 })
        .expect(404);
      expect(patch.body.error.code).toBe('NOT_FOUND');

      const deletion = await request(app.getHttpServer())
        .delete(`/api/v1/sources/${UNKNOWN_ID}`)
        .expect(404);
      expect(deletion.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes a source with 204 and then returns 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/sources/${sourceId}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/sources/${sourceId}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('deleting a referenced source', () => {
    it('returns 409 while another record references the source', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/sources')
        .send({ title: `${PREFIX} Referenced`, type: 'ARCHIVE' })
        .expect(201);

      await ds.query(`INSERT INTO e2e_source_refs (source_id) VALUES ($1)`, [
        created.body.id,
      ]);

      const deletion = await request(app.getHttpServer())
        .delete(`/api/v1/sources/${created.body.id}`)
        .expect(409);
      expect(deletion.body.error.code).toBe('CONFLICT');

      await request(app.getHttpServer())
        .get(`/api/v1/sources/${created.body.id}`)
        .expect(200);

      await ds.query(`DELETE FROM e2e_source_refs WHERE source_id = $1`, [
        created.body.id,
      ]);
      await request(app.getHttpServer())
        .delete(`/api/v1/sources/${created.body.id}`)
        .expect(204);
    });
  });
});
