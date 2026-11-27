import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { GEOCODING_PROVIDER } from '../geocoding/interfaces/geocoding.tokens';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { VillageModule } from '../village/village.module';
import { VillageService } from '../village/village.service';
import { GeographyController } from './geography.controller';
import { GeographyModule } from './geography.module';
import { GeographyService } from './geography.service';

@Module({
  providers: [{ provide: VillageService, useValue: {} }],
  exports: [VillageService],
})
class GeographyTestVillageModule {}

@Module({
  providers: [
    { provide: GEOCODING_PROVIDER, useValue: { geocode: jest.fn() } },
  ],
  exports: [GEOCODING_PROVIDER],
})
class GeographyTestGeocodingModule {}

@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useValue: {
        entityMetadatas: [],
        options: { type: 'postgres' },
        getRepository: jest.fn().mockReturnValue({}),
      },
    },
  ],
  exports: [getDataSourceToken()],
})
class GeographyTestDatabaseModule {}

describe('GeographyModule', () => {
  it('compiles and resolves the service and controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GeographyTestDatabaseModule, GeographyModule],
    })
      .overrideModule(VillageModule)
      .useModule(GeographyTestVillageModule)
      .overrideModule(GeocodingModule)
      .useModule(GeographyTestGeocodingModule)
      .compile();

    try {
      const geographyModule = moduleRef.select(GeographyModule);

      expect(geographyModule.get(GeographyService)).toBeInstanceOf(
        GeographyService,
      );
      expect(geographyModule.get(GeographyController)).toBeInstanceOf(
        GeographyController,
      );
    } finally {
      await moduleRef.close();
    }
  });
});
