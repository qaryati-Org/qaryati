
import { Injectable } from '@nestjs/common';
import {
  GeocodingProvider,
  GeocodingResult,
} from '../interfaces/geocoding-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

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

        const response = await this.rateLimiter.execute(() =>
          fetch(url, {
            headers: {
              'User-Agent': 'Qaryati/1.0',
            },
            signal: AbortSignal.timeout(5000),
          }),
        );

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

        const results =
          (await response.json()) as NominatimSearchResult[];

        if (results.length === 0) {
          return null;
        }

        const result = results[0];

        return {
          latitude: Number(result.lat),
          longitude: Number(result.lon),
          displayName: result.display_name,
        };
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

    if (error instanceof TypeError) {
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
