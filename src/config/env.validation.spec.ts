import { envValidationSchema } from './env.validation';

describe('envValidationSchema geocoding settings', () => {
  const requiredDatabaseEnvironment = {
    DB_HOST: 'localhost',
    DB_USER: 'qaryati',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'qaryati',
    GEOCODING_USER_AGENT: 'Qaryati/1.0 (contact: developer@example.com)',
  };

  it('provides defaults for geocoding settings', () => {
    const { error, value } = envValidationSchema.validate(
      requiredDatabaseEnvironment,
    );

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      GEOCODING_BASE_URL: 'https://nominatim.openstreetmap.org',
      GEOCODING_USER_AGENT: 'Qaryati/1.0 (contact: developer@example.com)',
      GEOCODING_TIMEOUT_MS: 3000,
      GEOCODING_MAX_RETRIES: 2,
      GEOCODING_CACHE_TTL_MS: 86400000,
      GEOCODING_CACHE_MAX_ENTRIES: 1000,
    });
  });

  it('rejects a missing User-Agent', () => {
    const environment = { ...requiredDatabaseEnvironment };
    Reflect.deleteProperty(environment, 'GEOCODING_USER_AGENT');
    const { error } = envValidationSchema.validate(environment);

    expect(error).toBeDefined();
  });

  it('rejects a non-empty User-Agent without contact information', () => {
    const { error } = envValidationSchema.validate({
      ...requiredDatabaseEnvironment,
      GEOCODING_USER_AGENT: 'Qaryati/1.0',
    });

    expect(error).toBeDefined();
  });

  it('accepts a User-Agent with a contact email', () => {
    const userAgent = 'Qaryati/1.0 (contact: developer@example.com)';
    const { error, value } = envValidationSchema.validate({
      ...requiredDatabaseEnvironment,
      GEOCODING_USER_AGENT: userAgent,
    });

    expect(error).toBeUndefined();
    expect(value.GEOCODING_USER_AGENT).toBe(userAgent);
  });

  it.each([
    'Qaryati/1.0 (contact: )',
    'Qaryati/1.0 (contact: invalid-email)',
    'Qaryati/1.0 (contact: a..b@example..com)',
  ])('rejects invalid contact email in User-Agent: %s', (userAgent) => {
    const { error } = envValidationSchema.validate({
      ...requiredDatabaseEnvironment,
      GEOCODING_USER_AGENT: userAgent,
    });

    expect(error).toBeDefined();
  });

  it.each([
    ['GEOCODING_BASE_URL', 'not-a-url'],
    ['GEOCODING_USER_AGENT', '   '],
    ['GEOCODING_TIMEOUT_MS', '0'],
    ['GEOCODING_TIMEOUT_MS', '1.5'],
    ['GEOCODING_MAX_RETRIES', '-1'],
    ['GEOCODING_MAX_RETRIES', '1.5'],
    ['GEOCODING_CACHE_TTL_MS', '-1'],
    ['GEOCODING_CACHE_TTL_MS', '2.5'],
    ['GEOCODING_CACHE_MAX_ENTRIES', '0'],
    ['GEOCODING_CACHE_MAX_ENTRIES', '1.5'],
  ])('rejects invalid %s value %s', (key, value) => {
    const { error } = envValidationSchema.validate({
      ...requiredDatabaseEnvironment,
      [key]: value,
    });

    expect(error).toBeDefined();
  });
});
