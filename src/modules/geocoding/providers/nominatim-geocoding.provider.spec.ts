import { HttpClient, HttpResponse } from '../interfaces/http-client.interface';
import { GeocodingResult } from '../interfaces/geocoding-provider.interface';
import { GeocodingCacheService } from '../cache/geocoding-cache.service';
import { GeocodingRetryService } from '../services/geocoding-retry.service';
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

  let httpGetMock: jest.Mock;
  let parseMock: jest.Mock;
  let executeMock: jest.Mock;
  let cacheGetMock: jest.Mock;
  let cacheSetMock: jest.Mock;

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

    provider = new NominatimGeocodingProvider(
      httpClient,
      responseParser,
      retryService,
      retryPolicy,
      cacheService,
    );
  });

  it('successfully geocodes an address', async () => {
    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockReturnValue(mockGeocodingResult);

    const result = await provider.geocode('Nablus, Palestine');

    expect(result).toEqual(mockGeocodingResult);
  });

  it('returns null when no results are found', async () => {
    httpGetMock.mockResolvedValue(createResponse([]));

    parseMock.mockReturnValue(null);

    const result = await provider.geocode('Unknown Location');

    expect(result).toBeNull();
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
        'User-Agent': 'Qaryati/1.0',
      },
      timeoutMs: 5000,
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

  it('propagates HTTP client errors', async () => {
    const error = new Error('HTTP request failed');

    httpGetMock.mockRejectedValue(error);

    await expect(provider.geocode('Nablus, Palestine')).rejects.toBe(error);

    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it('propagates response parser errors', async () => {
    const error = new Error('Invalid response');

    httpGetMock.mockResolvedValue(createResponse(mockApiResponse));

    parseMock.mockImplementation(() => {
      throw error;
    });

    await expect(provider.geocode('Nablus, Palestine')).rejects.toBe(error);

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
    await expect(provider.geocode('   ')).rejects.toThrow(
      'Address must not be empty',
    );

    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(httpGetMock).not.toHaveBeenCalled();
  });
});
