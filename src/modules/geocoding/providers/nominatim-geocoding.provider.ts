
import { Injectable } from '@nestjs/common';
import {
  GeocodingProvider,
  GeocodingResult,
} from '../interfaces/geocoding-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';

class NominatimHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'NominatimHttpError';
  }
}

class NominatimNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NominatimNetworkError';
  }
}

function parseNominatimResult(data: unknown): GeocodingResult | null {
  if (!Array.isArray(data)) {
    throw new Error('Invalid Nominatim response: expected an array');
  }

  if (data.length === 0) {
    return null;
  }

  const result: unknown = data[0];

  if (typeof result !== 'object' || result === null) {
    throw new Error(
      'Invalid Nominatim response: invalid result structure',
    );
  }

  const record = result as Record<string, unknown>;

  if (
    typeof record.lat !== 'string' ||
    typeof record.lon !== 'string' ||
    typeof record.display_name !== 'string'
  ) {
    throw new Error(
      'Invalid Nominatim response: invalid result structure',
    );
  }

  const latitude = Number(record.lat);
  const longitude = Number(record.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Invalid Nominatim response: invalid coordinates');
  }

  return {
    latitude,
    longitude,
    displayName: record.display_name,
  };
}

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly rateLimiter = new RateLimiter(1000);

  async geocode(address: string): Promise<GeocodingResult | null> {
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const url = new URL(
          'https://nominatim.openstreetmap.org/search',
        );

        url.searchParams.set('q', address);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('limit', '1');

        const response = await this.rateLimiter.execute(async () => {
          try {
            return await fetch(url, {
              headers: {
                'User-Agent': 'Qaryati/1.0',
              },
              signal: AbortSignal.timeout(5000),
            });
          } catch (error) {
            if (error instanceof TypeError) {
              throw new NominatimNetworkError(error.message);
            }

            throw error;
          }
        });

        if (!response.ok) {
          const retryAfterMs =
            response.status === 429
              ? this.getRetryAfter(response)
              : undefined;

          throw new NominatimHttpError(
            response.status,
            `Nominatim request failed: ${response.status}`,
            retryAfterMs,
          );
        }

        const data: unknown = await response.json();

        return parseNominatimResult(data);
      } catch (error) {
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          console.error('Geocoding request failed:', error);
          throw error;
        }

        const delayTime =
          error instanceof NominatimHttpError &&
            error.retryAfterMs !== undefined
            ? error.retryAfterMs
            : baseDelay * 2 ** attempt;

        await this.delay(delayTime);
      }
    }

    throw new Error('Geocoding failed after all retry attempts');
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof NominatimHttpError) {
      return (
        [500, 502, 503, 504].includes(error.status) ||
        error.status === 429
      );
    }

    if (error instanceof NominatimNetworkError) {
      return true;
    }

    if (
      error instanceof DOMException &&
      ['TimeoutError', 'AbortError'].includes(error.name)
    ) {
      return true;
    }

    return false;
  }

  private getRetryAfter(response: Response): number {
    const retryAfter = response.headers.get('Retry-After');

    if (!retryAfter) {
      return 1000;
    }

    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(1000, seconds * 1000);
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isNaN(retryDate)) {
      return 1000;
    }

    return Math.max(1000, retryDate - Date.now());
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
