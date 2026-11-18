
import { Module } from '@nestjs/common';

import { HTTP_CLIENT } from './interfaces/geocoding.tokens';

import { FetchHttpClient } from './http/fetch-http-client';

import { GeocodingCacheService } from './cache/geocoding-cache.service';

import { GeocodingRetryService } from './services/geocoding-retry.service';

import { NominatimGeocodingProvider } from './providers/nominatim-geocoding.provider';
import { NominatimResponseParser } from './providers/nominatim-response.parser';
import { NominatimRetryPolicy } from './providers/nominatim-retry.policy';

@Module({
    providers: [
        {
            provide: HTTP_CLIENT,
            useClass: FetchHttpClient,
        },
        GeocodingCacheService,
        NominatimResponseParser,
        GeocodingRetryService,
        NominatimRetryPolicy,
        NominatimGeocodingProvider,
    ],
    exports: [NominatimGeocodingProvider],
})
export class GeocodingModule { }
