import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import type { GeocodingProvider } from '../src/modules/geocoding/interfaces/geocoding-provider.interface';
import { createTestApp } from './utils/create-test-app';
import { callerWithRole, httpAs, TestCaller } from './utils/auth';

interface VillageFixture {
  id: string;
  nameAr: string;
  nameEn: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface NearbyVillageResponse {
  id: string;
  nameAr: string;
  nameEn: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

const fixtureToken = randomUUID();
const governorateId = randomUUID();
const governorateNameEn = `E2E Geography ${fixtureToken}`;
const arabicFallbackName = `قرية ${fixtureToken}`;

const villages: Record<string, VillageFixture> = {
  success: {
    id: randomUUID(),
    nameAr: `قرية ناجحة ${fixtureToken}`,
    nameEn: `E2E Geocode ${fixtureToken}`,
    latitude: null,
    longitude: null,
  },
  arabicFallback: {
    id: randomUUID(),
    nameAr: arabicFallbackName,
    nameEn: null,
    latitude: null,
    longitude: null,
  },
  existingBoth: {
    id: randomUUID(),
    nameAr: `E2E Existing Both ${fixtureToken}`,
    nameEn: `E2E Existing Both ${fixtureToken}`,
    latitude: 32.2,
    longitude: 35.25,
  },
  existingLatitudeOnly: {
    id: randomUUID(),
    nameAr: `E2E Existing Latitude ${fixtureToken}`,
    nameEn: `E2E Existing Latitude ${fixtureToken}`,
    latitude: 32.2,
    longitude: null,
  },
  existingLongitudeOnly: {
    id: randomUUID(),
    nameAr: `E2E Existing Longitude ${fixtureToken}`,
    nameEn: `E2E Existing Longitude ${fixtureToken}`,
    latitude: null,
    longitude: 35.25,
  },
  unresolved: {
    id: randomUUID(),
    nameAr: `E2E Unresolved ${fixtureToken}`,
    nameEn: `E2E Unresolved ${fixtureToken}`,
    latitude: null,
    longitude: null,
  },
  providerError: {
    id: randomUUID(),
    nameAr: `E2E Provider Error ${fixtureToken}`,
    nameEn: `E2E Provider Error ${fixtureToken}`,
    latitude: null,
    longitude: null,
  },
  reference: {
    id: randomUUID(),
    nameAr: `E2E Nearby Reference ${fixtureToken}`,
    nameEn: `E2E Nearby Reference ${fixtureToken}`,
    latitude: 32.0,
    longitude: 35.0,
  },
  nearby: {
    id: randomUUID(),
    nameAr: `E2E Nearby ${fixtureToken}`,
    nameEn: `E2E Nearby ${fixtureToken}`,
    latitude: 32.018,
    longitude: 35.0,
  },
  withinDefaultRadius: {
    id: randomUUID(),
    nameAr: `E2E Default Radius ${fixtureToken}`,
    nameEn: `E2E Default Radius ${fixtureToken}`,
    latitude: 32.07,
    longitude: 35.0,
  },
  far: {
    id: randomUUID(),
    nameAr: `E2E Far ${fixtureToken}`,
    nameEn: `E2E Far ${fixtureToken}`,
    latitude: 32.18,
    longitude: 35.0,
  },
  sameLocationA: {
    id: randomUUID(),
    nameAr: `E2E Same Location A ${fixtureToken}`,
    nameEn: `E2E Same Location A ${fixtureToken}`,
    latitude: 32.0,
    longitude: 35.0,
  },
  sameLocationB: {
    id: randomUUID(),
    nameAr: `E2E Same Location B ${fixtureToken}`,
    nameEn: `E2E Same Location B ${fixtureToken}`,
    latitude: 32.0,
    longitude: 35.0,
  },
  missingLatitude: {
    id: randomUUID(),
    nameAr: `E2E Missing Latitude ${fixtureToken}`,
    nameEn: `E2E Missing Latitude ${fixtureToken}`,
    latitude: null,
    longitude: 35.0,
  },
  missingLongitude: {
    id: randomUUID(),
    nameAr: `E2E Missing Longitude ${fixtureToken}`,
    nameEn: `E2E Missing Longitude ${fixtureToken}`,
    latitude: 32.0,
    longitude: null,
  },
  missingBoth: {
    id: randomUUID(),
    nameAr: `E2E Missing Both ${fixtureToken}`,
    nameEn: `E2E Missing Both ${fixtureToken}`,
    latitude: null,
    longitude: null,
  },
};

const geocodeMock: jest.MockedFunction<GeocodingProvider['geocode']> =
  jest.fn();
const geocodingProvider: jest.Mocked<GeocodingProvider> = {
  geocode: geocodeMock,
};

describe('Geography endpoints (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let admin: TestCaller;

  const geocodePath = (id: string) =>
    `/api/v1/geography/villages/${id}/geocode`;
  const nearbyPath = (id: string) => `/api/v1/geography/villages/${id}/nearby`;

  const readCoordinates = async (
    id: string,
  ): Promise<{ latitude: number | null; longitude: number | null }> => {
    if (!dataSource) {
      throw new Error('The test database is not initialized');
    }

    const rows = await dataSource.query<
      { latitude: number | null; longitude: number | null }[]
    >('SELECT latitude, longitude FROM villages WHERE id = $1', [id]);

    return rows[0];
  };

  const getNearby = (id: string, radius?: number | string) => {
    const requestBuilder = request(app!.getHttpServer()).get(nearbyPath(id));
    return radius === undefined
      ? requestBuilder
      : requestBuilder.query({ radius });
  };

  const nearbyData = (body: unknown): NearbyVillageResponse[] => {
    expect(body).toEqual({ data: expect.any(Array) });
    return (body as { data: NearbyVillageResponse[] }).data;
  };

  beforeAll(async () => {
    app = await createTestApp({ geocodingProvider });
    admin = await callerWithRole(app, Role.ADMIN);
    const db = app.get(DataSource);
    dataSource = db;

    await db.query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [governorateId, `محافظة ${fixtureToken}`, governorateNameEn],
    );

    for (const village of Object.values(villages)) {
      await db.query(
        `INSERT INTO villages
           (id, name_ar, name_en, governorate_id, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          village.id,
          village.nameAr,
          village.nameEn,
          governorateId,
          village.latitude,
          village.longitude,
        ],
      );
    }
  }, 30000);

  beforeEach(() => {
    geocodeMock.mockReset();
  });

  it('requires authentication to geocode a village', async () => {
    const response = await request(app!.getHttpServer())
      .post(geocodePath(villages.success.id))
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('forbids viewers from geocoding a village', async () => {
    const viewer = await callerWithRole(app!, Role.VIEWER);
    const response = await httpAs(app!, viewer)
      .post(geocodePath(villages.success.id))
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query(
          'DELETE FROM villages WHERE id = ANY($1::uuid[])',
          [Object.values(villages).map(({ id }) => id)],
        );
        await dataSource.query('DELETE FROM governorates WHERE id = $1', [
          governorateId,
        ]);
      }
    } finally {
      await app?.close();
    }
  });

  it('geocodes and persists coordinates using the English village name', async () => {
    geocodingProvider.geocode.mockResolvedValue({
      latitude: 32.2211,
      longitude: 35.2544,
      displayName: 'Ignored provider display name',
    });

    const response = await httpAs(app!, admin)
      .post(geocodePath(villages.success.id))
      .expect(200);

    expect(response.body).toMatchObject({
      id: villages.success.id,
      latitude: 32.2211,
      longitude: 35.2544,
      governorate: {
        id: governorateId,
        nameEn: governorateNameEn,
      },
    });
    expect(geocodeMock).toHaveBeenCalledTimes(1);
    expect(geocodeMock).toHaveBeenCalledWith(
      `${villages.success.nameEn}, ${governorateNameEn}, Palestine`,
    );
    await expect(readCoordinates(villages.success.id)).resolves.toEqual({
      latitude: 32.2211,
      longitude: 35.2544,
    });
  });

  it('uses the Arabic village name when the English name is null', async () => {
    geocodingProvider.geocode.mockResolvedValue({
      latitude: 32.3,
      longitude: 35.3,
      displayName: 'Ignored provider display name',
    });

    await httpAs(app!, admin)
      .post(geocodePath(villages.arabicFallback.id))
      .expect(200);

    expect(geocodeMock).toHaveBeenCalledTimes(1);
    expect(geocodeMock).toHaveBeenCalledWith(
      `${arabicFallbackName}, ${governorateNameEn}, Palestine`,
    );
  });

  it('rejects an invalid village UUID', async () => {
    const response = await httpAs(app!, admin)
      .post(geocodePath('not-a-uuid'))
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('returns not found for a valid UUID without a village', async () => {
    const response = await httpAs(app!, admin)
      .post(geocodePath(randomUUID()))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it.each([
    { description: 'both coordinates', fixture: villages.existingBoth },
    {
      description: 'latitude only',
      fixture: villages.existingLatitudeOnly,
    },
    {
      description: 'longitude only',
      fixture: villages.existingLongitudeOnly,
    },
  ])('rejects a village with $description already set', async ({ fixture }) => {
    const response = await httpAs(app!, admin)
      .post(geocodePath(fixture.id))
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(geocodeMock).not.toHaveBeenCalled();
    await expect(readCoordinates(fixture.id)).resolves.toEqual({
      latitude: fixture.latitude,
      longitude: fixture.longitude,
    });
  });

  it('returns unprocessable entity when no location is resolved', async () => {
    geocodingProvider.geocode.mockResolvedValue(null);

    const response = await httpAs(app!, admin)
      .post(geocodePath(villages.unresolved.id))
      .expect(422);

    expect(response.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    expect(geocodeMock).toHaveBeenCalledWith(
      `${villages.unresolved.nameEn}, ${governorateNameEn}, Palestine`,
    );
    await expect(readCoordinates(villages.unresolved.id)).resolves.toEqual({
      latitude: null,
      longitude: null,
    });
  });

  it('returns an internal error for an unexpected provider exception', async () => {
    geocodingProvider.geocode.mockRejectedValue(
      new Error('Unexpected provider failure'),
    );

    const response = await httpAs(app!, admin)
      .post(geocodePath(villages.providerError.id))
      .expect(500);

    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(geocodeMock).toHaveBeenCalledWith(
      `${villages.providerError.nameEn}, ${governorateNameEn}, Palestine`,
    );
    await expect(readCoordinates(villages.providerError.id)).resolves.toEqual({
      latitude: null,
      longitude: null,
    });
  });

  describe('Nearby villages endpoint', () => {
    it('uses the 10 km default radius and excludes the reference and far village', async () => {
      const response = await getNearby(villages.reference.id).expect(200);
      const data = nearbyData(response.body);
      const ids = data.map(({ id }) => id);
      const nearbyVillage = data.find(({ id }) => id === villages.nearby.id);
      const defaultRadiusVillage = data.find(
        ({ id }) => id === villages.withinDefaultRadius.id,
      );

      expect(ids).toContain(villages.nearby.id);
      expect(ids).toContain(villages.withinDefaultRadius.id);
      expect(ids).not.toContain(villages.reference.id);
      expect(ids).not.toContain(villages.far.id);
      expect(nearbyVillage).toMatchObject({
        latitude: 32.018,
        longitude: 35.0,
      });
      expect(nearbyVillage?.distanceKm).toBeCloseTo(2.0015, 3);
      expect(defaultRadiusVillage?.distanceKm).toBeGreaterThan(3);
      expect(defaultRadiusVillage?.distanceKm).toBeLessThan(10);
      expect(data.every(({ distanceKm }) => distanceKm <= 10)).toBe(true);
      expect(data.map(({ distanceKm }) => distanceKm)).toEqual(
        [...data.map(({ distanceKm }) => distanceKm)].sort(
          (left, right) => left - right,
        ),
      );
    });

    it('filters villages using an explicit radius of 3 km', async () => {
      const response = await getNearby(villages.reference.id, 3).expect(200);
      const data = nearbyData(response.body);
      const ids = data.map(({ id }) => id);
      const nearbyVillage = data.find(({ id }) => id === villages.nearby.id);

      expect(ids).toContain(villages.nearby.id);
      expect(ids).not.toContain(villages.withinDefaultRadius.id);
      expect(ids).not.toContain(villages.far.id);
      expect(nearbyVillage?.distanceKm).toBeCloseTo(2.0015, 3);
      expect(data.every(({ distanceKm }) => distanceKm <= 3)).toBe(true);
    });

    it('excludes candidates with either or both coordinates missing', async () => {
      const response = await getNearby(villages.reference.id, 100).expect(200);
      const data = nearbyData(response.body);
      const ids = data.map(({ id }) => id);

      expect(ids).not.toEqual(
        expect.arrayContaining([
          villages.missingLatitude.id,
          villages.missingLongitude.id,
          villages.missingBoth.id,
        ]),
      );
      expect(
        data.every(
          ({ latitude, longitude }) => latitude !== null && longitude !== null,
        ),
      ).toBe(true);
    });

    it('includes zero-distance villages and orders equal distances by ID', async () => {
      const response = await getNearby(villages.reference.id, 3).expect(200);
      const data = nearbyData(response.body);
      const sameLocationIds = [
        villages.sameLocationA.id,
        villages.sameLocationB.id,
      ];
      const sameLocationVillages = data.filter(({ id }) =>
        sameLocationIds.includes(id),
      );

      expect(sameLocationVillages).toHaveLength(2);
      expect(sameLocationVillages.map(({ id }) => id)).toEqual(
        [...sameLocationIds].sort(),
      );
      for (const village of sameLocationVillages) {
        expect(village).toMatchObject({ latitude: 32.0, longitude: 35.0 });
        expect(village.distanceKm).toBeCloseTo(0, 10);
      }
      expect(data.map(({ distanceKm }) => distanceKm)).toEqual(
        [...data.map(({ distanceKm }) => distanceKm)].sort(
          (left, right) => left - right,
        ),
      );
    });

    it('returns an empty data array when no candidate is within the radius', async () => {
      const response = await getNearby(villages.far.id, 0.1).expect(200);

      expect(nearbyData(response.body)).toEqual([]);
    });

    it('rejects an invalid village UUID', async () => {
      const response = await getNearby('not-a-uuid').expect(400);

      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns not found for a valid UUID without a village', async () => {
      const response = await getNearby(randomUUID()).expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it.each([
      { description: 'latitude', fixture: villages.missingLatitude },
      { description: 'longitude', fixture: villages.missingLongitude },
    ])(
      'rejects a reference village with missing $description',
      async ({ fixture }) => {
        const response = await getNearby(fixture.id).expect(422);

        expect(response.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      },
    );

    it.each(['0', '-1', '100.01', 'not-a-number'])(
      'rejects radius=%s with a validation error',
      async (radius) => {
        const response = await getNearby(villages.reference.id, radius).expect(
          400,
        );

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'radius' }),
          ]),
        );
      },
    );

    it('accepts a valid fractional radius', async () => {
      const response = await getNearby(villages.reference.id, 0.5).expect(200);
      const data = nearbyData(response.body);

      expect(data.map(({ id }) => id)).toEqual(
        [villages.sameLocationA.id, villages.sameLocationB.id].sort(),
      );
    });

    it('accepts the maximum radius and returns calculated PostgreSQL distances', async () => {
      const response = await getNearby(villages.reference.id, 100).expect(200);
      const data = nearbyData(response.body);
      const farVillage = data.find(({ id }) => id === villages.far.id);

      expect(data.map(({ id }) => id)).toContain(villages.far.id);
      expect(farVillage?.distanceKm).toBeCloseTo(20.0151, 3);
    });
  });
});
