import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { PopulationRecord } from './entities/population-record.entity';
import {
  PopulationController,
  PopulationHistoryController,
} from './population.controller';
import { PopulationReviewAuthenticationGuard } from './population-review-auth.guard';
import { PopulationService } from './population.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PopulationRecord]),
    VillageModule,
    SourceModule,
  ],
  controllers: [PopulationController, PopulationHistoryController],
  providers: [PopulationService, PopulationReviewAuthenticationGuard],
  exports: [PopulationService],
})
export class PopulationModule {}
