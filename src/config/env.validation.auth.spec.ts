import { DEV_ONLY_JWT_SECRET, envValidationSchema } from './env.validation';

describe('envValidationSchema auth settings', () => {
  const base = {
    DB_HOST: 'localhost',
    DB_USER: 'qaryati',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'qaryati',
  };

  it('falls back to the dev-only secret outside production', () => {
    const { error, value } = envValidationSchema.validate(base);
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      JWT_ACCESS_SECRET: DEV_ONLY_JWT_SECRET,
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 604800,
    });
  });

  it('requires a real secret in production', () => {
    const { error } = envValidationSchema.validate({
      ...base,
      NODE_ENV: 'production',
    });
    expect(error?.message).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('rejects a secret shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate({
      ...base,
      JWT_ACCESS_SECRET: 'too-short',
    });
    expect(error?.message).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('requires ADMIN_EMAIL and ADMIN_PASSWORD together', () => {
    const { error } = envValidationSchema.validate({
      ...base,
      ADMIN_EMAIL: 'admin@example.com',
    });
    expect(error).toBeDefined();
  });
});
