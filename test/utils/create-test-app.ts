import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/setup-app';

export interface TestAppOptions {
  // Login/register attempts per minute. E2E files log in far more often
  // than a real client, so the default is high; the rate-limit test lowers it.
  authRateLimit?: number;
}

// Boots the full app exactly like main.ts does. Needs a running Postgres
// (docker compose up -d db); migrations run on startup.
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  process.env.AUTH_RATE_LIMIT = String(options.authRateLimit ?? 1000);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();
  return app;
}
