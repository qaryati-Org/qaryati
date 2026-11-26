import Joi from 'joi';

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
    .default('Qaryati/1.0 (contact: yahyajaara1411@gmail.com)'),
  GEOCODING_TIMEOUT_MS: Joi.number().integer().positive().default(5000),
  GEOCODING_CACHE_TTL_MS: Joi.number().integer().positive().default(86400000),
  GEOCODING_CACHE_MAX_ENTRIES: Joi.number().integer().positive().default(1000),
});
