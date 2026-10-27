import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Governorate } from './entities/governorate.entity';
import { Village } from './entities/village.entity';
import { VillageController } from './village.controller';
import { VillageService } from './village.service';

@Module({
  imports: [TypeOrmModule.forFeature([Village, Governorate])],
  controllers: [VillageController],
  providers: [VillageService],
  // Exported so other modules can check that a village exists.
  exports: [VillageService],
})
export class VillageModule {}
