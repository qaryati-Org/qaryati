import { Inject, Injectable } from '@nestjs/common';

import {
  GeocodingProvider,
  GeocodingResult,
} from '../interfaces/geocoding-provider.interface';

import { HTTP_CLIENT } from '../interfaces/geocoding.tokens';
import type { HttpClient } from '../interfaces/http-client.interface';

import { GeocodingCacheService } from '../cache/geocoding-cache.service';

import { NominatimResponseParser } from './nominatim-response.parser';
import { NominatimRetryPolicy } from './nominatim-retry.policy';
import { GeocodingRetryService } from '../services/geocoding-retry.service';

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  constructor(
    @Inject(HTTP_CLIENT)
    private readonly httpClient: HttpClient,
    private readonly responseParser: NominatimResponseParser,
    private readonly retryService: GeocodingRetryService,
    private readonly retryPolicy: NominatimRetryPolicy,
    private readonly cacheService: GeocodingCacheService,
  ) {}

  async geocode(address: string): Promise<GeocodingResult | null> {
    const normalizedAddress = address.trim();

    if (normalizedAddress.length === 0) {
      throw new Error('Address must not be empty');
    }

    const cacheKey = normalizedAddress.replace(/\s+/g, ' ').toLowerCase();

    const cachedResult = this.cacheService.get(cacheKey);

    if (cachedResult !== null) {
      return cachedResult;
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');

    url.searchParams.set('q', normalizedAddress);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');

    const result = await this.retryService.execute(async () => {
      const response = await this.httpClient.get(url, {
        headers: {
          'User-Agent': 'Qaryati/1.0',
        },
        timeoutMs: 5000,
      });

      const data = await response.json();

      return this.responseParser.parse(data);
    }, this.retryPolicy);

    if (result !== null) {
      this.cacheService.set(cacheKey, result);
    }

    return result;
  }
}
