import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GEOCODING_PROVIDER } from '../geocoding/interfaces/geocoding.tokens';
import type { GeocodingProvider } from '../geocoding/interfaces/geocoding-provider.interface';
import { VillageResponseDto } from '../village/dto/village-response.dto';
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
  let moduleRef: TestingModule;

  beforeEach(async () => {
    villageService = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    geocodeMock = jest.fn();
    geocodingProvider = { geocode: geocodeMock };

    moduleRef = await Test.createTestingModule({
      providers: [
        GeographyService,
        { provide: VillageService, useValue: villageService },
        { provide: GEOCODING_PROVIDER, useValue: geocodingProvider },
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
});
