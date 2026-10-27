import { join } from 'path';
import pg from 'pg';
import { DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/configuration';

// Shared by the Nest app and the TypeORM CLI so both always use the same
// entities and migrations. Schema changes go through migrations only:
// `synchronize` stays off in every environment.
export function buildDataSourceOptions(
  db: AppConfig['database'],
): DataSourceOptions {
  return {
    type: 'postgres',
    // Pass the driver explicitly: TypeORM's dynamic lookup can resolve the
    // optional pg-native binding under Jest and fail with "reading 'Pool'".
    driver: pg,
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.name,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsRun: db.runMigrations,
    synchronize: false,
    logging: db.logging,
  };
}
