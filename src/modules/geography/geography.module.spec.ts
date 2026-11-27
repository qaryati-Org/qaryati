import { Test } from '@nestjs/testing';
import { GeographyController } from './geography.controller';
import { GeographyModule } from './geography.module';
import { GeographyService } from './geography.service';

describe('GeographyModule', () => {
  it('compiles and resolves the service and controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GeographyModule],
    }).compile();

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
