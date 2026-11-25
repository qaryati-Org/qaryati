import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { HistoryRecord } from './entities/history-record.entity';
import { HistoryAuthenticationGuard } from './history-authentication.guard';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HistoryRecord]),
    VillageModule,
    SourceModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService, HistoryAuthenticationGuard],
  exports: [HistoryService],
})
export class HistoryModule {}
