import 'dotenv/config';
import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration';
import { buildDataSourceOptions } from './typeorm.options';

// Entry point for the TypeORM CLI (migration:generate / run / revert).
export default new DataSource(buildDataSourceOptions(configuration().database));
