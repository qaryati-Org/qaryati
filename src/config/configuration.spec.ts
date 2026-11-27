import { configuration } from './configuration';

describe('configuration geocoding settings', () => {
  const environmentKeys = [
    'GEOCODING_USER_AGENT',
    'GEOCODING_TIMEOUT_MS',
    'GEOCODING_MAX_RETRIES',
  ] as const;
  const originalEnvironment: Partial<
    Record<(typeof environmentKeys)[number], string | undefined>
  > = {};

  beforeEach(() => {
    for (const key of environmentKeys) {
      originalEnvironment[key] = process.env[key];
    }

    process.env.GEOCODING_USER_AGENT =
      'Qaryati/1.0 (contact: developer@example.com)';
    delete process.env.GEOCODING_TIMEOUT_MS;
    delete process.env.GEOCODING_MAX_RETRIES;
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const originalValue = originalEnvironment[key];

      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  });

  it('uses the 3000 ms timeout and two retries by default', () => {
    expect(configuration().geocoding).toMatchObject({
      timeoutMs: 3000,
      maxRetries: 2,
    });
  });

  it('loads timeout and retry count from environment variables', () => {
    process.env.GEOCODING_TIMEOUT_MS = '2500';
    process.env.GEOCODING_MAX_RETRIES = '4';

    expect(configuration().geocoding).toMatchObject({
      timeoutMs: 2500,
      maxRetries: 4,
    });
  });
});
