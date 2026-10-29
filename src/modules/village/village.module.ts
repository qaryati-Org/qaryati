import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrativeDivisionService } from './administrative-division.service';
import { Governorate } from './entities/governorate.entity';
import { Municipality } from './entities/municipality.entity';
import { Village } from './entities/village.entity';
import { GovernorateController } from './governorate.controller';
import { MunicipalityController } from './municipality.controller';
import { VillageController } from './village.controller';
import { VillageService } from './village.service';

@Module({
  imports: [TypeOrmModule.forFeature([Village, Governorate, Municipality])],
  controllers: [
    VillageController,
    GovernorateController,
    MunicipalityController,
  ],
  providers: [VillageService, AdministrativeDivisionService],
  // Exported so other modules can check that a village exists.
  exports: [VillageService],
})
export class VillageModule {}
