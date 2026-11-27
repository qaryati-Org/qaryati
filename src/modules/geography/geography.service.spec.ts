import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GEOCODING_PROVIDER } from '../geocoding/interfaces/geocoding.tokens';
import type { GeocodingProvider } from '../geocoding/interfaces/geocoding-provider.interface';
import { VillageResponseDto } from '../village/dto/village-response.dto';
import { Village } from '../village/entities/village.entity';
import { VillageService } from '../village/village.service';
import { GeographyService } from './geography.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';

const villageResponse = (
  overrides: Partial<VillageResponseDto> = {},
): VillageResponseDto => ({
  id: VILLAGE_ID,
  nameAr: 'برقة',
  nameEn: 'Burqa',
  nameOrigin: null,
  latitude: null,
  longitude: null,
  governorate: {
    id: '00000000-0000-4000-8000-000000000002',
    nameAr: 'نابلس',
    nameEn: 'Nablus',
  },
  municipality: null,
  ...overrides,
});

describe('GeographyService', () => {
  let service: GeographyService;
  let villageService: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let geocodingProvider: jest.Mocked<GeocodingProvider>;
  let geocodeMock: jest.Mock;
  let villageRepository: { createQueryBuilder: jest.Mock };
  let nearbyQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    setParameters: jest.Mock;
    getRawMany: jest.Mock;
  };
  let moduleRef: TestingModule;

  beforeEach(async () => {
    villageService = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    geocodeMock = jest.fn();
    geocodingProvider = { geocode: geocodeMock };
    nearbyQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    villageRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(nearbyQueryBuilder),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        GeographyService,
        { provide: VillageService, useValue: villageService },
        { provide: GEOCODING_PROVIDER, useValue: geocodingProvider },
        { provide: getRepositoryToken(Village), useValue: villageRepository },
      ],
    }).compile();

    service = moduleRef.get(GeographyService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('geocodes and persists a village using its English names', async () => {
    const village = villageResponse();
    const updatedVillage = villageResponse({
      latitude: 32.2211,
      longitude: 35.2544,
    });
    villageService.findOne.mockResolvedValue(village);
    geocodingProvider.geocode.mockResolvedValue({
      latitude: 32.2211,
      longitude: 35.2544,
      displayName: 'Burqa, Nablus, Palestine',
    });
    villageService.update.mockResolvedValue(updatedVillage);

    await expect(service.geocodeVillage(VILLAGE_ID)).resolves.toBe(
      updatedVillage,
    );

    expect(villageService.findOne).toHaveBeenCalledWith(VILLAGE_ID);
    expect(geocodeMock).toHaveBeenCalledWith('Burqa, Nablus, Palestine');
    expect(villageService.update).toHaveBeenCalledWith(VILLAGE_ID, {
      latitude: 32.2211,
      longitude: 35.2544,
    });
  });

  it('uses the Arabic village name when the English name is null', async () => {
    villageService.findOne.mockResolvedValue(villageResponse({ nameEn: null }));
    geocodingProvider.geocode.mockResolvedValue({
      latitude: 32.2211,
      longitude: 35.2544,
      displayName: 'برقة, Nablus, Palestine',
    });
    villageService.update.mockResolvedValue(villageResponse());

    await service.geocodeVillage(VILLAGE_ID);

    expect(geocodeMock).toHaveBeenCalledWith('برقة, Nablus, Palestine');
  });

  it('rejects villages that already have both coordinates', async () => {
    villageService.findOne.mockResolvedValue(
      villageResponse({ latitude: 32.2, longitude: 35.2 }),
    );

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(geocodeMock).not.toHaveBeenCalled();
    expect(villageService.update).not.toHaveBeenCalled();
  });

  it('rejects villages with latitude but no longitude', async () => {
    villageService.findOne.mockResolvedValue(
      villageResponse({ latitude: 32.2, longitude: null }),
    );

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(geocodeMock).not.toHaveBeenCalled();
    expect(villageService.update).not.toHaveBeenCalled();
  });

  it('rejects villages with longitude but no latitude', async () => {
    villageService.findOne.mockResolvedValue(
      villageResponse({ latitude: null, longitude: 35.2 }),
    );

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(geocodeMock).not.toHaveBeenCalled();
    expect(villageService.update).not.toHaveBeenCalled();
  });

  it('rejects when geocoding does not resolve a location', async () => {
    villageService.findOne.mockResolvedValue(villageResponse());
    geocodingProvider.geocode.mockResolvedValue(null);

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(villageService.update).not.toHaveBeenCalled();
  });

  it('propagates the village not-found exception without geocoding', async () => {
    const error = new NotFoundException('Village not found');
    villageService.findOne.mockRejectedValue(error);

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBe(error);

    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('propagates unexpected geocoding provider errors', async () => {
    const error = new Error('Provider failed');
    villageService.findOne.mockResolvedValue(villageResponse());
    geocodingProvider.geocode.mockRejectedValue(error);

    await expect(service.geocodeVillage(VILLAGE_ID)).rejects.toBe(error);

    expect(villageService.update).not.toHaveBeenCalled();
  });

  describe('findNearbyVillages', () => {
    it('uses the reference village coordinates and radius in the SQL query', async () => {
      villageService.findOne.mockResolvedValue(
        villageResponse({ latitude: 32.2, longitude: 35.25 }),
      );

      await service.findNearbyVillages(VILLAGE_ID, { radius: 25 });

      expect(villageService.findOne).toHaveBeenCalledWith(VILLAGE_ID);
      expect(villageRepository.createQueryBuilder).toHaveBeenCalledWith('v');
      expect(nearbyQueryBuilder.setParameters).toHaveBeenCalledWith({
        referenceVillageId: VILLAGE_ID,
        originLatitude: 32.2,
        originLongitude: 35.25,
        radius: 25,
      });

      const distanceExpression = nearbyQueryBuilder.addSelect.mock.calls.find(
        ([, alias]: [string, string]) => alias === 'distanceKm',
      )?.[0] as string;
      expect(distanceExpression).toContain('RADIANS');
      expect(distanceExpression).toContain('SIN');
      expect(distanceExpression).toContain('COS');
      expect(distanceExpression).toContain('ASIN');
      expect(distanceExpression).toContain('SQRT');
      expect(distanceExpression).toContain('6371');
      expect(nearbyQueryBuilder.orderBy).toHaveBeenCalledWith(
        distanceExpression,
        'ASC',
      );
      expect(nearbyQueryBuilder.addOrderBy).toHaveBeenCalledWith('v.id', 'ASC');
    });

    it('excludes the reference village and records without coordinates in SQL', async () => {
      villageService.findOne.mockResolvedValue(
        villageResponse({ latitude: 32.2, longitude: 35.25 }),
      );

      await service.findNearbyVillages(VILLAGE_ID, { radius: 10 });

      expect(nearbyQueryBuilder.where).toHaveBeenCalledWith(
        'v.id <> :referenceVillageId',
      );
      expect(nearbyQueryBuilder.andWhere).toHaveBeenCalledWith(
        'v.latitude IS NOT NULL',
      );
      expect(nearbyQueryBuilder.andWhere).toHaveBeenCalledWith(
        'v.longitude IS NOT NULL',
      );
      expect(
        nearbyQueryBuilder.andWhere.mock.calls.some(
          ([clause]: [string]) =>
            clause.includes('<= :radius') && clause.includes('RADIANS'),
        ),
      ).toBe(true);
    });

    it('maps raw results in database order', async () => {
      villageService.findOne.mockResolvedValue(
        villageResponse({ latitude: 32.2, longitude: 35.25 }),
      );
      nearbyQueryBuilder.getRawMany.mockResolvedValue([
        {
          id: 'v-closer',
          nameAr: 'قرية أقرب',
          nameEn: 'Closer Village',
          latitude: 32.21,
          longitude: 35.26,
          distanceKm: '1.5',
        },
        {
          id: 'v-farther',
          nameAr: 'قرية أبعد',
          nameEn: null,
          latitude: 32.3,
          longitude: 35.35,
          distanceKm: 12.75,
        },
      ]);

      const result = await service.findNearbyVillages(VILLAGE_ID, {
        radius: 20,
      });

      expect(result.data).toEqual([
        {
          id: 'v-closer',
          nameAr: 'قرية أقرب',
          nameEn: 'Closer Village',
          latitude: 32.21,
          longitude: 35.26,
          distanceKm: 1.5,
        },
        {
          id: 'v-farther',
          nameAr: 'قرية أبعد',
          nameEn: null,
          latitude: 32.3,
          longitude: 35.35,
          distanceKm: 12.75,
        },
      ]);
    });

    it('returns an empty data array when no villages match', async () => {
      villageService.findOne.mockResolvedValue(
        villageResponse({ latitude: 32.2, longitude: 35.25 }),
      );
      nearbyQueryBuilder.getRawMany.mockResolvedValue([]);

      await expect(
        service.findNearbyVillages(VILLAGE_ID, { radius: 10 }),
      ).resolves.toEqual({ data: [] });
    });

    it('propagates not-found errors from VillageService', async () => {
      const error = new NotFoundException('Village not found');
      villageService.findOne.mockRejectedValue(error);

      await expect(
        service.findNearbyVillages(VILLAGE_ID, { radius: 10 }),
      ).rejects.toBe(error);

      expect(villageRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it.each([
      ['latitude', { latitude: null, longitude: 35.25 }],
      ['longitude', { latitude: 32.2, longitude: null }],
    ])(
      'rejects a reference village with null %s',
      async (_coordinate, coordinates) => {
        villageService.findOne.mockResolvedValue(villageResponse(coordinates));

        await expect(
          service.findNearbyVillages(VILLAGE_ID, { radius: 10 }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);

        expect(villageRepository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );
  });
});
