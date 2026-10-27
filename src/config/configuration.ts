// Typed access to environment configuration. Values are already validated
// by env.validation.ts, so defaults here only matter for tooling (e.g. the
// TypeORM CLI) that loads this file outside of Nest.
export const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'log',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'qaryati',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'qaryati',
    runMigrations: (process.env.DB_RUN_MIGRATIONS ?? 'true') === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
});

export type AppConfig = ReturnType<typeof configuration>;
