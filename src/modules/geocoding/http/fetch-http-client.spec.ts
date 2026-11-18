
import { FetchHttpClient } from './fetch-http-client';
import {
    HttpNetworkError,
    HttpResponseError,
} from './http-client.errors';

describe('FetchHttpClient', () => {
    let client: FetchHttpClient;
    let originalFetch: typeof fetch;
    let fetchMock: jest.Mock;

    const createResponse = (
        status: number,
        body: unknown = [],
    ): Response => ({
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response;

    beforeEach(() => {
        originalFetch = global.fetch;
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;

        client = new FetchHttpClient();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        global.fetch = originalFetch;
    });

    it('sends a GET request and returns a successful HTTP response wrapper', async () => {
        const response = createResponse(200, [{ id: 1 }]);

        fetchMock.mockResolvedValue(response);

        const result = await client.get(
            new URL('https://example.com/test'),
        );

        expect(result).not.toBe(response);
        expect(result.status).toBe(200);
        expect(result.headers).toBe(response.headers);
        await expect(result.json()).resolves.toEqual([{ id: 1 }]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            new URL('https://example.com/test'),
            expect.objectContaining({
                signal: expect.any(AbortSignal),
            }),
        );
    });

    it('sends the provided request headers', async () => {
        fetchMock.mockResolvedValue(createResponse(200));

        await client.get(
            new URL('https://example.com/test'),
            {
                headers: {
                    'User-Agent': 'Qaryati/1.0',
                },
            },
        );

        expect(fetchMock).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({
                headers: {
                    'User-Agent': 'Qaryati/1.0',
                },
            }),
        );
    });

    it('uses the default timeout of 5000 milliseconds', async () => {
        fetchMock.mockResolvedValue(createResponse(200));

        const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

        await client.get(
            new URL('https://example.com/test'),
        );

        expect(timeoutSpy).toHaveBeenCalledWith(5000);

        const [, options] = fetchMock.mock.calls[0];

        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.signal.aborted).toBe(false);
    });

    it('uses a custom timeout when provided', async () => {
        fetchMock.mockResolvedValue(createResponse(200));

        const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

        await client.get(
            new URL('https://example.com/test'),
            {
                timeoutMs: 2000,
            },
        );

        expect(timeoutSpy).toHaveBeenCalledWith(2000);

        const [, options] = fetchMock.mock.calls[0];

        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.signal.aborted).toBe(false);
    });

    it('throws HttpResponseError when the response status is not successful', async () => {
        const response = {
            ok: false,
            status: 500,
            headers: new Headers(),
        } as Response;

        fetchMock.mockResolvedValue(response);

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBeInstanceOf(HttpResponseError);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves the HTTP status and headers in HttpResponseError', async () => {
        const headers = new Headers({
            'Retry-After': '5',
        });

        fetchMock.mockResolvedValue({
            ok: false,
            status: 429,
            headers,
        } as Response);

        try {
            await client.get(
                new URL('https://example.com/test'),
            );

            fail('Expected HttpResponseError to be thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(HttpResponseError);

            const responseError = error as HttpResponseError;

            expect(responseError.status).toBe(429);
            expect(
                responseError.headers.get('Retry-After'),
            ).toBe('5');
        }
    });

    it('converts network TypeError into HttpNetworkError', async () => {
        fetchMock.mockRejectedValue(
            new TypeError('Failed to fetch'),
        );

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBeInstanceOf(HttpNetworkError);
    });

    it('converts timeout DOMException into HttpNetworkError', async () => {
        fetchMock.mockRejectedValue(
            new DOMException('The operation timed out', 'TimeoutError'),
        );

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBeInstanceOf(HttpNetworkError);
    });

    it('converts abort DOMException into HttpNetworkError', async () => {
        fetchMock.mockRejectedValue(
            new DOMException('The operation was aborted', 'AbortError'),
        );

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBeInstanceOf(HttpNetworkError);
    });

    it('preserves unexpected errors instead of converting them', async () => {
        const error = new Error('Unexpected failure');

        fetchMock.mockRejectedValue(error);

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBe(error);
    });

    it('does not call response.json() when the HTTP response is unsuccessful', async () => {
        const json = jest.fn();

        fetchMock.mockResolvedValue({
            ok: false,
            status: 503,
            headers: new Headers(),
            json,
        } as unknown as Response);

        await expect(
            client.get(new URL('https://example.com/test')),
        ).rejects.toBeInstanceOf(HttpResponseError);

        expect(json).not.toHaveBeenCalled();
    });

    it('converts a network TypeError during JSON parsing into HttpNetworkError', async () => {
        const response = createResponse(200);

        (response.json as jest.Mock).mockRejectedValue(
            new TypeError('Network failure during JSON parsing'),
        );

        fetchMock.mockResolvedValue(response);

        const result = await client.get(
            new URL('https://example.com/test'),
        );

        await expect(result.json()).rejects.toBeInstanceOf(HttpNetworkError);
    });

    it('preserves unexpected JSON parsing errors', async () => {
        const error = new SyntaxError('Invalid JSON');
        const response = createResponse(200);

        (response.json as jest.Mock).mockRejectedValue(error);

        fetchMock.mockResolvedValue(response);

        const result = await client.get(
            new URL('https://example.com/test'),
        );

        await expect(result.json()).rejects.toBe(error);
    });
});
