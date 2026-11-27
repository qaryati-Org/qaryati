import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { CulturalTraitController } from './cultural-trait.controller';
import { CulturalTrait } from './entities/cultural-trait.entity';
import { Landmark } from './entities/landmark.entity';
import { CulturalTraitService } from './cultural-trait.service';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Landmark, CulturalTrait]),
    VillageModule,
    SourceModule,
  ],
  controllers: [LandmarkController, CulturalTraitController],
  providers: [LandmarkService, CulturalTraitService],
  exports: [LandmarkService, CulturalTraitService],
})
export class HeritageModule {}
