
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';

describe('NominatimGeocodingProvider', () => {
    let provider: NominatimGeocodingProvider;
    let originalFetch: typeof fetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        provider = new NominatimGeocodingProvider();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        global.fetch = originalFetch;
    });

    it('successfully geocodes an address', async () => {
        const mockResponse = [
            {
                lat: '32.2211',
                lon: '35.2544',
                display_name: 'Nablus, Palestine',
            },
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse),
        });

        const result = await provider.geocode('Nablus, Palestine');

        expect(result).toEqual({
            latitude: 32.2211,
            longitude: 35.2544,
            displayName: 'Nablus, Palestine',
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns null when no results are found', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([]),
        });

        const result = await provider.geocode('Unknown Location');

        expect(result).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it(
        'retries when the API returns HTTP 500 and succeeds on the second attempt',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'retries when the API returns HTTP 429 and succeeds on the third attempt',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': '1',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': '1',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(3);
        },
        15000,
    );

    it('does not retry when the API returns a non-retryable error', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => { });

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 400,
        });

        await expect(
            provider.geocode('Invalid Address'),
        ).rejects.toThrow('Nominatim request failed: 400');

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it(
        'retries when a network error occurs',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockRejectedValueOnce(new TypeError('Failed to fetch'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'throws an error after all retry attempts fail',
        async () => {
            jest.spyOn(console, 'error').mockImplementation(() => { });

            (global.fetch as jest.Mock).mockRejectedValue(
                new TypeError('Failed to fetch'),
            );

            await expect(
                provider.geocode('Nablus, Palestine'),
            ).rejects.toThrow('Failed to fetch');

            expect(global.fetch).toHaveBeenCalledTimes(4);
        },
        15000,
    );

    it(
        'uses the default retry delay when Retry-After header is missing',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers(),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'uses the default retry delay when Retry-After header is invalid',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': 'invalid-value',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'uses the HTTP date from Retry-After header',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            const retryDate = new Date(Date.now() + 2000).toUTCString();

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': retryDate,
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'uses the minimum retry delay when Retry-After date is in the past',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            const retryDate = new Date(Date.now() - 5000).toUTCString();

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': retryDate,
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'uses the minimum retry delay when Retry-After is zero',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Headers({
                        'Retry-After': '0',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it('sends the correct URL, query parameters, and headers', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([]),
        });

        await provider.geocode('Nablus, Palestine');

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [url, options] = (global.fetch as jest.Mock).mock.calls[0];

        expect(url).toBeInstanceOf(URL);
        expect(url.origin).toBe('https://nominatim.openstreetmap.org');
        expect(url.pathname).toBe('/search');

        expect(url.searchParams.get('q')).toBe('Nablus, Palestine');
        expect(url.searchParams.get('format')).toBe('jsonv2');
        expect(url.searchParams.get('limit')).toBe('1');

        expect(options.headers).toEqual({
            'User-Agent': 'Qaryati/1.0',
        });
    });

    it('sets a 5-second timeout for the HTTP request', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([]),
        });

        await provider.geocode('Nablus, Palestine');

        const [, options] = (global.fetch as jest.Mock).mock.calls[0];

        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.signal.aborted).toBe(false);
    });

    it(
        'retries when the HTTP request times out',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockRejectedValueOnce(
                    new DOMException('Request timed out', 'TimeoutError'),
                )
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it(
        'retries when the HTTP request is aborted',
        async () => {
            const mockResponse = [
                {
                    lat: '32.2211',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ];

            (global.fetch as jest.Mock)
                .mockRejectedValueOnce(
                    new DOMException('Request aborted', 'AbortError'),
                )
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue(mockResponse),
                });

            const result = await provider.geocode('Nablus, Palestine');

            expect(result).toEqual({
                latitude: 32.2211,
                longitude: 35.2544,
                displayName: 'Nablus, Palestine',
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        },
        15000,
    );

    it('throws an error when the API response is not an array', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ lat: '32.2211' }),
        });

        await expect(
            provider.geocode('Nablus, Palestine'),
        ).rejects.toThrow(
            'Invalid Nominatim response: expected an array',
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws an error when required result fields are missing', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([
                {
                    lat: '32.2211',
                    lon: '35.2544',
                },
            ]),
        });

        await expect(
            provider.geocode('Nablus, Palestine'),
        ).rejects.toThrow(
            'Invalid Nominatim response: invalid result structure',
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws an error when coordinates are not numeric', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([
                {
                    lat: 'invalid',
                    lon: '35.2544',
                    display_name: 'Nablus, Palestine',
                },
            ]),
        });

        await expect(
            provider.geocode('Nablus, Palestine'),
        ).rejects.toThrow(
            'Invalid Nominatim response: invalid coordinates',
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws an error when coordinates are outside valid geographic ranges', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([
                {
                    lat: '95',
                    lon: '35.2544',
                    display_name: 'Invalid Location',
                },
            ]),
        });

        await expect(
            provider.geocode('Invalid Location'),
        ).rejects.toThrow(
            'Invalid Nominatim response: invalid coordinates',
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

});
