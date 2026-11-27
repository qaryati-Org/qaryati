import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GEOCODING_PROVIDER } from '../../src/modules/geocoding/interfaces/geocoding.tokens';
import type { GeocodingProvider } from '../../src/modules/geocoding/interfaces/geocoding-provider.interface';
import { setupApp } from '../../src/setup-app';

export interface TestAppOptions {
  // Login/register attempts per minute. E2E files log in far more often
  // than a real client, so the default is high; the rate-limit test lowers it.
  authRateLimit?: number;
  geocodingProvider?: GeocodingProvider;
}

// Boots the full app exactly like main.ts does. Needs a running Postgres
// (docker compose up -d db); migrations run on startup.
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  process.env.AUTH_RATE_LIMIT = String(options.authRateLimit ?? 1000);
  const testingModule = Test.createTestingModule({
    imports: [AppModule],
  });
  if (options.geocodingProvider !== undefined) {
    testingModule
      .overrideProvider(GEOCODING_PROVIDER)
      .useValue(options.geocodingProvider);
  }
  const moduleRef = await testingModule.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();
  return app;
}
