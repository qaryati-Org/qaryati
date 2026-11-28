import { envValidationSchema } from '../../config/env.validation';
import { corsOptions, isValidCorsOrigin, parseCorsOrigins } from './cors';

describe('CORS configuration', () => {
  describe('parseCorsOrigins', () => {
    it('splits, trims and drops empty entries', () => {
      expect(
        parseCorsOrigins(' http://localhost:5173 ,https://qaryati.example,, '),
      ).toEqual(['http://localhost:5173', 'https://qaryati.example']);
    });

    it.each([undefined, '', '  '])('returns no origins for %p', (raw) => {
      expect(parseCorsOrigins(raw)).toEqual([]);
    });
  });

  describe('isValidCorsOrigin', () => {
    it.each([
      'http://localhost:5173',
      'https://qaryati.example',
      'https://app.qaryati.example:8443',
    ])('accepts %s', (origin) => {
      expect(isValidCorsOrigin(origin)).toBe(true);
    });

    it.each([
      '*',
      'localhost:5173',
      'ftp://qaryati.example',
      'https://qaryati.example/',
      'https://qaryati.example/app',
      'https://qaryati.example?x=1',
      'not a url',
    ])('rejects %s', (origin) => {
      expect(isValidCorsOrigin(origin)).toBe(false);
    });
  });

  describe('CORS_ORIGINS validation', () => {
    const base = {
      DB_HOST: 'localhost',
      DB_USER: 'qaryati',
      DB_PASSWORD: 'test-password',
      DB_NAME: 'qaryati',
      GEOCODING_USER_AGENT: 'Qaryati/1.0 (contact: ci@example.com)',
    };

    it('defaults to empty (CORS off)', () => {
      const { error, value } = envValidationSchema.validate(base);
      expect(error).toBeUndefined();
      expect(value).toMatchObject({ CORS_ORIGINS: '' });
    });

    it('accepts a list of origins', () => {
      const { error } = envValidationSchema.validate({
        ...base,
        CORS_ORIGINS: 'http://localhost:5173,https://qaryati.example',
      });
      expect(error).toBeUndefined();
    });

    it.each(['*', 'http://localhost:5173,https://qaryati.example/app'])(
      'refuses to start with %s',
      (value) => {
        const { error } = envValidationSchema.validate({
          ...base,
          CORS_ORIGINS: value,
        });
        expect(error?.message).toMatch(/CORS_ORIGINS/);
      },
    );
  });

  it('allows only the listed origins, without cookies', () => {
    expect(corsOptions(['http://localhost:5173'])).toMatchObject({
      origin: ['http://localhost:5173'],
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type', 'x-correlation-id'],
      exposedHeaders: ['x-correlation-id'],
    });
  });
});
