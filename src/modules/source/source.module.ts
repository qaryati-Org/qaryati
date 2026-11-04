import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Source } from './entities/source.entity';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';

@Module({
  imports: [TypeOrmModule.forFeature([Source])],
  controllers: [SourceController],
  providers: [SourceService],
  // Population, history, and heritage modules will call ensureExists.
  exports: [SourceService],
})
export class SourceModule {}
