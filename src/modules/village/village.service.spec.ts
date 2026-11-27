import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { Governorate } from './entities/governorate.entity';
import { Municipality } from './entities/municipality.entity';
import { Village } from './entities/village.entity';
import { VillageService } from './village.service';

const NABLUS = 'g-nablus';
const JENIN = 'g-jenin';
const NABLUS_COUNCIL = { id: 'm-nablus', governorateId: NABLUS };
const JENIN_COUNCIL = { id: 'm-jenin', governorateId: JENIN };

function pgError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError('SQL', [], { code, constraint } as never);
}

describe('VillageService (writes)', () => {
  let villages: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    remove: jest.Mock;
  };
  let governorates: { existsBy: jest.Mock };
  let municipalities: { findOneBy: jest.Mock };
  let service: VillageService;

  const stored = (overrides: Partial<Village> = {}): Village =>
    ({
      id: 'v-1',
      nameAr: 'برقة',
      nameEn: 'Burqa',
      nameOrigin: null,
      latitude: null,
      longitude: null,
      governorateId: NABLUS,
      municipalityId: NABLUS_COUNCIL.id,
      ...overrides,
    }) as Village;

  beforeEach(() => {
    villages = {
      create: jest.fn((v: Partial<Village>) => ({ ...v })),
      save: jest.fn((v: Partial<Village>) =>
        Promise.resolve({ id: 'v-1', ...v }),
      ),
      // findOne is only used to build the response after a write.
      findOne: jest.fn(() =>
        Promise.resolve({
          ...stored(),
          governorate: { id: NABLUS, nameAr: 'نابلس', nameEn: 'Nablus' },
          municipality: null,
        }),
      ),
      findOneBy: jest.fn(),
      remove: jest.fn(),
    };
    governorates = {
      existsBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(id === NABLUS || id === JENIN),
      ),
    };
    municipalities = {
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(
          [NABLUS_COUNCIL, JENIN_COUNCIL].find((m) => m.id === id) ?? null,
        ),
      ),
    };
    service = new VillageService(
      villages as unknown as Repository<Village>,
      governorates as unknown as Repository<Governorate>,
      municipalities as unknown as Repository<Municipality>,
    );
  });

  describe('create', () => {
    it('saves optional fields as null', async () => {
      await service.create({ nameAr: 'برقة', governorateId: NABLUS });

      expect(villages.save).toHaveBeenCalledWith({
        nameAr: 'برقة',
        nameEn: null,
        nameOrigin: null,
        latitude: null,
        longitude: null,
        governorateId: NABLUS,
        municipalityId: null,
      });
    });

    it('saves supplied coordinates', async () => {
      await service.create({
        nameAr: 'برقة',
        governorateId: NABLUS,
        latitude: 32.2211,
        longitude: 35.2544,
      });

      expect(villages.save).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 32.2211,
          longitude: 35.2544,
        }),
      );
    });

    it('rejects an unknown governorate with 422', async () => {
      await expect(
        service.create({ nameAr: 'برقة', governorateId: 'g-missing' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(villages.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown municipality with 422', async () => {
      await expect(
        service.create({
          nameAr: 'برقة',
          governorateId: NABLUS,
          municipalityId: 'm-missing',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a municipality from another governorate with 422', async () => {
      await expect(
        service.create({
          nameAr: 'برقة',
          governorateId: NABLUS,
          municipalityId: JENIN_COUNCIL.id,
        }),
      ).rejects.toThrow(/is not in governorate/);
    });

    it('turns the unique name violation into 409', async () => {
      villages.save.mockRejectedValue(
        pgError('23505', 'uq_villages_governorate_name_ar'),
      );

      await expect(
        service.create({ nameAr: 'برقة', governorateId: NABLUS }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows unexpected database errors', async () => {
      const error = pgError('40001');
      villages.save.mockRejectedValue(error);

      await expect(
        service.create({ nameAr: 'برقة', governorateId: NABLUS }),
      ).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('returns 404 for an unknown village', async () => {
      villages.findOneBy.mockResolvedValue(null);

      await expect(
        service.update('v-x', { nameAr: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('changes only the fields that were sent and skips admin checks', async () => {
      villages.findOneBy.mockResolvedValue(
        stored({ latitude: 32.2211, longitude: 35.2544 }),
      );

      await service.update('v-1', { nameOrigin: 'From "spring"' });

      expect(governorates.existsBy).not.toHaveBeenCalled();
      expect(villages.save).toHaveBeenCalledWith(
        expect.objectContaining({
          nameAr: 'برقة',
          nameEn: 'Burqa',
          nameOrigin: 'From "spring"',
          latitude: 32.2211,
          longitude: 35.2544,
          municipalityId: NABLUS_COUNCIL.id,
        }),
      );
    });

    it('clears nullable fields with null', async () => {
      villages.findOneBy.mockResolvedValue(stored());

      await service.update('v-1', { nameEn: null, municipalityId: null });

      expect(villages.save).toHaveBeenCalledWith(
        expect.objectContaining({ nameEn: null, municipalityId: null }),
      );
    });

    it('updates coordinates and clears them with null', async () => {
      villages.findOneBy.mockResolvedValue(
        stored({ latitude: 32.2211, longitude: 35.2544 }),
      );

      await service.update('v-1', { latitude: null, longitude: 35.3 });

      expect(villages.save).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: null, longitude: 35.3 }),
      );
    });

    it('refuses to move a village while keeping its old municipality', async () => {
      villages.findOneBy.mockResolvedValue(stored());

      await expect(
        service.update('v-1', { governorateId: JENIN }),
      ).rejects.toThrow(/send municipalityId/);
      expect(villages.save).not.toHaveBeenCalled();
    });

    it('moves a village together with a municipality of the new governorate', async () => {
      villages.findOneBy.mockResolvedValue(stored());

      await service.update('v-1', {
        governorateId: JENIN,
        municipalityId: JENIN_COUNCIL.id,
      });

      expect(villages.save).toHaveBeenCalledWith(
        expect.objectContaining({
          governorateId: JENIN,
          municipalityId: JENIN_COUNCIL.id,
        }),
      );
    });

    it('checks a new municipality against the current governorate', async () => {
      villages.findOneBy.mockResolvedValue(stored());

      await expect(
        service.update('v-1', { municipalityId: JENIN_COUNCIL.id }),
      ).rejects.toThrow(/is not in governorate/);
    });
  });

  describe('remove', () => {
    it('returns 404 for an unknown village', async () => {
      villages.findOneBy.mockResolvedValue(null);

      await expect(service.remove('v-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('turns a foreign key violation into 409', async () => {
      villages.findOneBy.mockResolvedValue(stored());
      villages.remove.mockRejectedValue(
        pgError('23503', 'population_records_village_id_fkey'),
      );

      await expect(service.remove('v-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
