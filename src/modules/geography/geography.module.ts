import { Module } from '@nestjs/common';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { VillageModule } from '../village/village.module';
import { GeographyController } from './geography.controller';
import { GeographyService } from './geography.service';

@Module({
  imports: [VillageModule, GeocodingModule],
  controllers: [GeographyController],
  providers: [GeographyService],
})
export class GeographyModule {}
