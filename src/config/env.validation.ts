import Joi from 'joi';
import { isValidCorsOrigin, parseCorsOrigins } from '../modules/auth/cors';

export const DEV_ONLY_JWT_SECRET =
  'dev-only-jwt-secret-never-use-in-production';

// Fail fast on startup if required configuration is missing or invalid.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_RUN_MIGRATIONS: Joi.boolean().default(true),
  DB_LOGGING: Joi.boolean().default(false),

  GEOCODING_BASE_URL: Joi.string()
    .uri()
    .default('https://nominatim.openstreetmap.org'),
  GEOCODING_USER_AGENT: Joi.string()
    .trim()
    .min(1)
    .custom((value: string, helpers) => {
      const contactPrefix = ' (contact: ';
      const contactStart = value.lastIndexOf(contactPrefix);

      if (contactStart <= 0 || !value.endsWith(')')) {
        return helpers.error('string.pattern.base');
      }

      const contactEmail = value.slice(contactStart + contactPrefix.length, -1);
      const { error } = Joi.string().email().validate(contactEmail);

      if (error) {
        return helpers.error('string.email');
      }

      return value;
    })
    .messages({
      'string.email': 'GEOCODING_USER_AGENT must include a valid contact email',
      'string.pattern.base':
        'GEOCODING_USER_AGENT must include a contact email in parentheses',
    })
    .required(),
  GEOCODING_TIMEOUT_MS: Joi.number().integer().positive().default(3000),
  GEOCODING_MAX_RETRIES: Joi.number().integer().min(0).default(2),
  GEOCODING_CACHE_TTL_MS: Joi.number().integer().positive().default(86400000),
  GEOCODING_CACHE_MAX_ENTRIES: Joi.number().integer().positive().default(1000),

  // Production must set real secrets. Development and test fall back to a
  // fixed dev-only value so teammates' existing .env files keep working.
  JWT_ACCESS_SECRET: Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().default(DEV_ONLY_JWT_SECRET),
    }),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number().integer().min(60).default(604800),
  // Max login/register attempts per client IP within the window.
  AUTH_RATE_LIMIT: Joi.number().integer().min(1).default(5),
  AUTH_RATE_LIMIT_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  // Browser origins allowed to call the API; empty keeps CORS off.
  CORS_ORIGINS: Joi.string()
    .allow('')
    .default('')
    .custom((value: string, helpers) =>
      parseCorsOrigins(value).every(isValidCorsOrigin)
        ? value
        : helpers.error('any.invalid'),
    )
    .messages({
      'any.invalid':
        'CORS_ORIGINS must be a comma-separated list of http(s) origins ' +
        'without paths or "*", e.g. http://localhost:5173',
    }),

  // Optional first admin, created on startup if no user has this email yet.
  ADMIN_EMAIL: Joi.string().email(),
  ADMIN_PASSWORD: Joi.string().min(12).max(128),
}).and('ADMIN_EMAIL', 'ADMIN_PASSWORD');
