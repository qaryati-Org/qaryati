import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { Landmark } from './entities/landmark.entity';
import { LandmarkReviewAuthenticationGuard } from './landmark-review-authentication.guard';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';

@Module({
  imports: [TypeOrmModule.forFeature([Landmark]), VillageModule, SourceModule],
  controllers: [LandmarkController],
  providers: [LandmarkService, LandmarkReviewAuthenticationGuard],
  exports: [LandmarkService],
})
export class HeritageModule {}
