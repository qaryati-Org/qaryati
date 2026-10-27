import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { AppConfig, configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthModule } from './health/health.module';
import { VillageModule } from './modules/village/village.module';

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
  ],
})
export class AppModule {}
