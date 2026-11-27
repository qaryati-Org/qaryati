import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HttpNetworkError,
  HttpResponseError,
} from '../http/http-client.errors';

import {
  GeocodingProvider,
  GeocodingResult,
} from '../interfaces/geocoding-provider.interface';
import type { AppConfig } from '../../../config/configuration';

import { HTTP_CLIENT } from '../interfaces/geocoding.tokens';
import type { HttpClient } from '../interfaces/http-client.interface';

import { GeocodingCacheService } from '../cache/geocoding-cache.service';

import { NominatimResponseParser } from './nominatim-response.parser';
import { NominatimRetryPolicy } from './nominatim-retry.policy';
import { GeocodingRetryService } from '../services/geocoding-retry.service';

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocodingProvider.name);

  constructor(
    @Inject(HTTP_CLIENT)
    private readonly httpClient: HttpClient,
    private readonly responseParser: NominatimResponseParser,
    private readonly retryService: GeocodingRetryService,
    private readonly retryPolicy: NominatimRetryPolicy,
    private readonly cacheService: GeocodingCacheService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async geocode(address: string): Promise<GeocodingResult | null> {
    const normalizedAddress = address.trim();

    if (normalizedAddress.length === 0) {
      throw new BadRequestException('Address must not be empty');
    }

    const cacheKey = normalizedAddress.replace(/\s+/g, ' ').toLowerCase();

    const cachedResult = this.cacheService.get(cacheKey);

    if (cachedResult !== null) {
      return cachedResult;
    }

    const geocodingConfig = this.configService.get('geocoding', {
      infer: true,
    });
    const url = new URL('/search', geocodingConfig.baseUrl);

    url.searchParams.set('q', normalizedAddress);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');

    let result: GeocodingResult | null;

    try {
      result = await this.retryService.execute(async () => {
        const response = await this.httpClient.get(url, {
          headers: {
            'User-Agent': geocodingConfig.userAgent,
          },
          timeoutMs: geocodingConfig.timeoutMs,
        });

        const data = await response.json();

        return this.responseParser.parse(data);
      }, this.retryPolicy);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Nominatim geocoding request failed: ${message}`);

      if (
        error instanceof HttpNetworkError ||
        (error instanceof HttpResponseError && error.status === 429)
      ) {
        throw new ServiceUnavailableException(
          'Geocoding provider is unavailable',
        );
      }

      throw new BadGatewayException('Geocoding provider request failed');
    }

    if (result !== null) {
      this.cacheService.set(cacheKey, result);
    }

    return result;
  }
}
