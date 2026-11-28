import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { CORRELATION_HEADER } from '../../common/logging/correlation-id.middleware';

// CORS_ORIGINS is a comma-separated allow-list of browser origins, e.g.
// "http://localhost:5173,https://qaryati.example". Empty means CORS stays
// off: API clients, API-Dog and k6 do not need it, only browser apps on
// another origin do.
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

// An origin is scheme + host + optional port, nothing else. "*" is refused:
// every allowed site must be named.
export function isValidCorsOrigin(origin: string): boolean {
  if (origin === '*') return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}

export function corsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', CORRELATION_HEADER],
    // Lets browser code read the correlation id to report a failed request.
    exposedHeaders: [CORRELATION_HEADER],
    // Tokens travel in the Authorization header, not in cookies.
    credentials: false,
    // Browsers may cache the preflight answer for 10 minutes.
    maxAge: 600,
  };
}
