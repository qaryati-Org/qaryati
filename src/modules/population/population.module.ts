import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source/source.module';
import { VillageModule } from '../village/village.module';
import { PopulationRecord } from './entities/population-record.entity';
import { PopulationController } from './population.controller';
import { PopulationService } from './population.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PopulationRecord]),
    VillageModule,
    SourceModule,
  ],
  controllers: [PopulationController],
  providers: [PopulationService],
  exports: [PopulationService],
})
export class PopulationModule {}
