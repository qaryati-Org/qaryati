import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { AdministrativeDivisionService } from './administrative-division.service';
import { Governorate } from './entities/governorate.entity';
import { Municipality } from './entities/municipality.entity';
import { VillageName } from './entities/village-name.entity';
import { Village } from './entities/village.entity';
import { GovernorateController } from './governorate.controller';
import { MunicipalityController } from './municipality.controller';
import { VillageNameController } from './village-name.controller';
import { VillageNameService } from './village-name.service';
import { VillageController } from './village.controller';
import { VillageService } from './village.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Village, Governorate, Municipality, VillageName]),
    // Names can cite a source (SourceService.ensureExists).
    SourceModule,
  ],
  controllers: [
    VillageController,
    VillageNameController,
    GovernorateController,
    MunicipalityController,
  ],
  providers: [
    VillageService,
    VillageNameService,
    AdministrativeDivisionService,
  ],
  // Exported so other modules can check that a village exists.
  exports: [VillageService],
})
export class VillageModule {}
