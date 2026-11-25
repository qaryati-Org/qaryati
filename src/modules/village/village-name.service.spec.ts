import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { SourceService } from '../source';
import { VillageName, VillageNameType } from './entities/village-name.entity';
import { Village } from './entities/village.entity';
import { VillageNameService } from './village-name.service';

const village = { id: 'v-1', nameAr: 'برقة', nameEn: 'Burqa' } as Village;
const input = {
  name: 'Burka',
  type: VillageNameType.ALTERNATIVE_SPELLING,
  language: 'en',
};

describe('VillageNameService', () => {
  let names: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let villages: { findOneBy: jest.Mock };
  let sources: { ensureExists: jest.Mock };
  let service: VillageNameService;

  beforeEach(() => {
    names = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((n: Partial<VillageName>) => ({ ...n })),
      save: jest.fn((n: Partial<VillageName>) =>
        Promise.resolve({ id: 'n-1', createdAt: new Date(), ...n }),
      ),
      delete: jest.fn(),
    };
    villages = { findOneBy: jest.fn().mockResolvedValue(village) };
    sources = { ensureExists: jest.fn().mockResolvedValue(undefined) };
    service = new VillageNameService(
      names as unknown as Repository<VillageName>,
      villages as unknown as Repository<Village>,
      sources as unknown as SourceService,
    );
  });

  it('returns 404 when the village does not exist', async () => {
    villages.findOneBy.mockResolvedValue(null);

    await expect(service.list('v-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.create('v-x', input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filters the list by type when given', async () => {
    await service.list('v-1', { type: VillageNameType.HISTORICAL });

    expect(names.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { villageId: 'v-1', type: VillageNameType.HISTORICAL },
      }),
    );
  });

  it('saves optional fields as null and skips the source check without a source', async () => {
    const result = await service.create('v-1', input);

    expect(sources.ensureExists).not.toHaveBeenCalled();
    expect(names.save).toHaveBeenCalledWith({
      villageId: 'v-1',
      ...input,
      period: null,
      note: null,
      sourceId: null,
    });
    expect(result).toMatchObject({ id: 'n-1', name: 'Burka' });
  });

  it('checks the source when one is given', async () => {
    sources.ensureExists.mockRejectedValue(
      new UnprocessableEntityException('Source s-x does not exist'),
    );

    await expect(
      service.create('v-1', { ...input, sourceId: 's-x' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(names.save).not.toHaveBeenCalled();
  });

  it.each(['برقة', 'Burqa'])(
    'rejects the current name "%s" with 409',
    async (current) => {
      await expect(
        service.create('v-1', { ...input, name: current }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('turns the unique violation into 409', async () => {
    names.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'uq_village_names_village_name',
      } as never),
    );

    await expect(service.create('v-1', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes only a name of the given village', async () => {
    names.delete.mockResolvedValue({ affected: 1 });

    await service.remove('v-1', 'n-1');

    expect(names.delete).toHaveBeenCalledWith({ id: 'n-1', villageId: 'v-1' });
  });

  it('returns 404 when the name is not found for the village', async () => {
    names.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('v-1', 'n-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
