import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { AppConfig, configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthModule } from './health/health.module';
import { SourceModule } from './modules/source/source.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VillageModule } from './modules/village/village.module';
import { PopulationModule } from './modules/population/population.module';
import { HistoryModule } from './modules/history/history.module';
import { HeritageModule } from './modules/heritage/heritage.module';
import { CulturalTraitModule } from './modules/heritage/cultural-trait.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildDataSourceOptions(config.get('database', { infer: true })),
    }),
    CommonModule,
    HealthModule,
    // Feature modules: one line per module, each owned by one team member.
    VillageModule,
    SourceModule,
    AuthModule,
    UsersModule,
    PopulationModule,
    HistoryModule,
    HeritageModule,
    CulturalTraitModule,
    GeocodingModule,
  ],
})
export class AppModule {}
