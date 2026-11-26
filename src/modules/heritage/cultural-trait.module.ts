import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { CulturalTraitReviewAuthenticationGuard } from './cultural-trait-review-authentication.guard';
import { CulturalTraitController } from './cultural-trait.controller';
import { CulturalTrait } from './entities/cultural-trait.entity';
import { CulturalTraitService } from './cultural-trait.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CulturalTrait]),
    VillageModule,
    SourceModule,
  ],
  controllers: [CulturalTraitController],
  providers: [CulturalTraitService, CulturalTraitReviewAuthenticationGuard],
  exports: [CulturalTraitService],
})
export class CulturalTraitModule {}
