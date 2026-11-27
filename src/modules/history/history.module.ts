import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceModule } from '../source';
import { VillageModule } from '../village/village.module';
import { HistoryRecord } from './entities/history-record.entity';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HistoryRecord]),
    VillageModule,
    SourceModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
