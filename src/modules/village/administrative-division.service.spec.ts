import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdministrativeDivisionService } from './administrative-division.service';
import { Governorate } from './entities/governorate.entity';
import { Municipality, MunicipalityType } from './entities/municipality.entity';

describe('AdministrativeDivisionService', () => {
  const governorate = { id: 'g-1', nameAr: 'نابلس', nameEn: 'Nablus' };
  let municipalities: { findOne: jest.Mock };
  let service: AdministrativeDivisionService;

  beforeEach(() => {
    municipalities = { findOne: jest.fn() };
    service = new AdministrativeDivisionService(
      {} as Repository<Governorate>,
      municipalities as unknown as Repository<Municipality>,
    );
  });

  it('maps a municipality with its governorate', async () => {
    municipalities.findOne.mockResolvedValue({
      id: 'm-1',
      nameAr: 'بلدية',
      nameEn: null,
      type: MunicipalityType.MUNICIPALITY,
      governorate,
    });

    await expect(service.findMunicipality('m-1')).resolves.toEqual({
      id: 'm-1',
      nameAr: 'بلدية',
      nameEn: null,
      type: MunicipalityType.MUNICIPALITY,
      governorate,
    });
  });

  it('throws NotFoundException for an unknown municipality', async () => {
    municipalities.findOne.mockResolvedValue(null);
    await expect(service.findMunicipality('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
