import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClient, HttpResponse } from '../interfaces/http-client.interface';
import { GeocodingResult } from '../interfaces/geocoding-provider.interface';
import { GeocodingCacheService } from '../cache/geocoding-cache.service';
import { GeocodingRetryService } from '../services/geocoding-retry.service';
import type { AppConfig } from '../../../config/configuration';
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';
import { NominatimResponseParser } from './nominatim-response.parser';
import { NominatimRetryPolicy } from './nominatim-retry.policy';

describe('NominatimGeocodingProvider', () => {
  let provider: NominatimGeocodingProvider;
  let httpClient: jest.Mocked<HttpClient>;
  let responseParser: NominatimResponseParser;
  let retryService: GeocodingRetryService;
  let retryPolicy: NominatimRetryPolicy;
  let cacheService: GeocodingCacheService;
  let configService: ConfigService<AppConfig, true>;

  let httpGetMock: jest.Mock;
  let parseMock: jest.Mock;
  let executeMock: jest.Mock;
  let cacheGetMock: jest.Mock;
  let cacheSetMock: jest.Mock;
  let configGetMock: jest.Mock;

  const geocodingConfig: AppConfig['geocoding'] = {
    baseUrl: 'https://nominatim.openstreetmap.org',
    userAgent: 'Qaryati/1.0 (contact: yahyajaara1411@gmail.com)',
    timeoutMs: 5000,
    cacheTtlMs: 86400000,
    cacheMaxEntries: 1000,
  };

  const mockApiResponse = [
    {
      lat: '32.2211',
      lon: '35.2544',
      display_name: 'Nablus, Palestine',
    },
  ];

  const mockGeocodingResult: GeocodingResult = {
    latitude: 32.2211,
    longitude: 35.2544,
    displayName: 'Nablus, Palestine',
  };

  const createResponse = (data: unknown): HttpResponse => ({
    status: 200,
    headers: new Headers(),
    json: jest.fn().mockResolvedValue(data),
  });

  beforeEach(() => {
    httpGetMock = jest.fn();

    httpClient = {
      get: httpGetMock,
    };

    parseMock = jest.fn();

    responseParser = {
      parse: parseMock,
    };

    executeMock = jest.fn(
      async <T>(operation: () => Promise<T>): Promise<T> => {
        return operation();
      },
    );

    retryService = {
      execute: executeMock,
    } as unknown as GeocodingRetryService;

    retryPolicy = new NominatimRetryPolicy();

    cacheGetMock = jest.fn().mockReturnValue(null);
    cacheSetMock = jest.fn();

    cacheService = {
      get: cacheGetMock,
      set: cacheSetMock,
      clear: jest.fn(),
    } as unknown as GeocodingCacheService;

    configGetMock = jest.fn().mockReturnValue(geocodingConfig);
    configService = {
      get: configGetMock,
    } as unknown as ConfigService<AppConfig, true>;

    provider = new NominatimGeocodingProvider(
      httpClient,
      responseParser,
      retryService,
      retryPolicy,
      cacheService,
      configService,
    );
  });

  it('successfully geocodes an address', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    const result = await provider.geocode('Nablus, Palestine');

    expect(result).toEqual(mockGeocodingResult);
  });

  it('returns null when no results are found', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    httpGetMock.mockResolvedValue(createResponse([]));

    parseMock.mockReturnValue(null);

    const result = await provider.geocode('Unknown Location');

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('constructs the correct URL and request options', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('Nablus, Palestine');

    expect(httpGetMock).toHaveBeenCalledTimes(1);

    const [url, options] = httpGetMock.mock.calls[0];

    expect(url).toBeInstanceOf(URL);
    expect(url.origin).toBe('https://nominatim.openstreetmap.org');
    expect(url.pathname).toBe('/search');

    expect(url.searchParams.get('q')).toBe('Nablus, Palestine');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('1');

    expect(options).toEqual({
      headers: {
        'User-Agent': 'Qaryati/1.0 (contact: yahyajaara1411@gmail.com)',
      },
      timeoutMs: 5000,
    });
  });

  it('uses the configured base URL, User-Agent, and timeout', async () => {
    configGetMock.mockReturnValue({
      ...geocodingConfig,
      baseUrl: 'https://geocoder.example.test',
      userAgent: 'TestGeocoder/2.0',
      timeoutMs: 1250,
    });
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));
    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('Nablus, Palestine');

    const [url, options] = httpGetMock.mock.calls[0];

    expect(url.origin).toBe('https://geocoder.example.test');
    expect(options).toEqual({
      headers: {
        'User-Agent': 'TestGeocoder/2.0',
      },
      timeoutMs: 1250,
    });
  });

  it('passes the HTTP response data to the response parser', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('Nablus, Palestine');

    expect(parseMock).toHaveBeenCalledWith(mockApiResponse);
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it('uses the retry service with the configured retry policy', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('Nablus, Palestine');

    expect(executeMock).toHaveBeenCalledTimes(1);

    expect(executeMock).toHaveBeenCalledWith(expect.any(Function), retryPolicy);
  });

  it('returns null and logs a warning for HTTP client errors', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = new Error('HTTP request failed');

    httpGetMock.mockRejectedValue(error);

    await expect(provider.geocode('Nablus, Palestine')).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalled();
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it('returns null and logs a warning for response parser errors', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = new Error('Invalid response');

    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockImplementation(() => {
      throw error;
    });

    await expect(provider.geocode('Nablus, Palestine')).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalled();
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it('returns a cached result without making an HTTP request', async () => {
    cacheGetMock.mockReturnValue(mockGeocodingResult);

    const result = await provider.geocode('Nablus, Palestine');

    expect(result).toEqual(mockGeocodingResult);
    expect(httpGetMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('uses a normalized address as the cache key', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('  Nablus,   Palestine  ');

    expect(cacheGetMock).toHaveBeenCalledWith('nablus, palestine');
  });

  it('caches a successful geocoding result', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    await provider.geocode('Nablus, Palestine');

    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledWith(
      'nablus, palestine',
      mockGeocodingResult,
    );
  });

  it('does not cache null results', async () => {
    httpGetMock.mockResolvedValue(createResponse([]));

    parseMock.mockReturnValue(null);

    const result = await provider.geocode('Unknown Location');

    expect(result).toBeNull();
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it('rejects an empty address', async () => {
    const result = provider.geocode('   ');

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Address must not be empty');

    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(httpGetMock).not.toHaveBeenCalled();
  });
});
