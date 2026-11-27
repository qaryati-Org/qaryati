import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { CreateVillageDto } from './create-village.dto';
import { UpdateVillageDto } from './update-village.dto';
import { VillageResponseDto } from './village-response.dto';
import { Village } from '../entities/village.entity';

const createVillageDto = (values: object = {}) =>
  plainToInstance(CreateVillageDto, {
    nameAr: 'برقة',
    governorateId: '00000000-0000-4000-8000-000000000001',
    ...values,
  });

describe('Village coordinates', () => {
  it('defines nullable double-precision entity columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === Village,
    );

    for (const propertyName of ['latitude', 'longitude']) {
      const column = columns.find((item) => item.propertyName === propertyName);

      expect(column?.options).toMatchObject({
        type: 'double precision',
        nullable: true,
      });
    }
  });

  it('accepts valid coordinates in create and update DTOs', async () => {
    const createErrors = await validate(
      createVillageDto({ latitude: -90, longitude: 180 }),
    );
    const updateErrors = await validate(
      plainToInstance(UpdateVillageDto, {
        latitude: 32.2211,
        longitude: 35.2544,
      }),
    );

    expect(createErrors).toHaveLength(0);
    expect(updateErrors).toHaveLength(0);
  });

  it.each([
    ['latitude', -90.01],
    ['latitude', 90.01],
    ['longitude', -180.01],
    ['longitude', 180.01],
  ])('rejects %s outside its valid range: %s', async (coordinate, value) => {
    const errors = await validate(createVillageDto({ [coordinate]: value }));

    expect(errors.map((error) => error.property)).toContain(coordinate);
  });

  it.each([
    ['latitude', -90.01],
    ['latitude', 90.01],
    ['longitude', -180.01],
    ['longitude', 180.01],
  ])(
    'rejects %s outside its valid range in UpdateVillageDto: %s',
    async (coordinate, value) => {
      const updateDto = plainToInstance(UpdateVillageDto, {
        [coordinate]: value,
      });
      const errors = await validate(updateDto);

      expect(errors.map((error) => error.property)).toContain(coordinate);
    },
  );

  it('accepts omitted and null coordinates', async () => {
    const createOmittedErrors = await validate(createVillageDto());
    const createNullErrors = await validate(
      createVillageDto({ latitude: null, longitude: null }),
    );
    const updateOmittedErrors = await validate(
      plainToInstance(UpdateVillageDto, {}),
    );
    const updateNullErrors = await validate(
      plainToInstance(UpdateVillageDto, {
        latitude: null,
        longitude: null,
      }),
    );

    expect(createOmittedErrors).toHaveLength(0);
    expect(createNullErrors).toHaveLength(0);
    expect(updateOmittedErrors).toHaveLength(0);
    expect(updateNullErrors).toHaveLength(0);
  });

  it('maps coordinates to the village response, including null values', () => {
    const village = {
      id: 'v-1',
      nameAr: 'برقة',
      nameEn: 'Burqa',
      nameOrigin: null,
      latitude: 32.2211,
      longitude: 35.2544,
      governorate: { id: 'g-1', nameAr: 'نابلس', nameEn: 'Nablus' },
      municipality: null,
    } as Village;

    expect(VillageResponseDto.from(village)).toMatchObject({
      latitude: 32.2211,
      longitude: 35.2544,
    });
    expect(
      VillageResponseDto.from({
        ...village,
        latitude: null,
        longitude: null,
      }),
    ).toMatchObject({ latitude: null, longitude: null });
  });
});
