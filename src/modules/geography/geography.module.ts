import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { VillageModule } from '../village/village.module';
import { Village } from '../village/entities/village.entity';
import { GeographyController } from './geography.controller';
import { GeographyService } from './geography.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Village]),
    VillageModule,
    GeocodingModule,
  ],
  controllers: [GeographyController],
  providers: [GeographyService],
})
export class GeographyModule {}
