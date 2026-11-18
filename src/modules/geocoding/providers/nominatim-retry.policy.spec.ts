
import {
    HttpNetworkError,
    HttpResponseError,
} from '../http/http-client.errors';
import { NominatimRetryPolicy } from './nominatim-retry.policy';

describe('NominatimRetryPolicy', () => {
    let policy: NominatimRetryPolicy;

    beforeEach(() => {
        policy = new NominatimRetryPolicy();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('maxRetries', () => {
        it('allows a maximum of three retries', () => {
            expect(policy.maxRetries).toBe(3);
        });
    });

    describe('shouldRetry', () => {
        it('retries network errors', () => {
            expect(
                policy.shouldRetry(
                    new HttpNetworkError('Network failure'),
                ),
            ).toBe(true);
        });

        it.each([429, 500, 502, 503, 504])(
            'retries HTTP status %i',
            (status) => {
                const error = new HttpResponseError(
                    status,
                    new Headers(),
                );

                expect(policy.shouldRetry(error)).toBe(true);
            },
        );

        it.each([400, 401, 403, 404, 422])(
            'does not retry HTTP status %i',
            (status) => {
                const error = new HttpResponseError(
                    status,
                    new Headers(),
                );

                expect(policy.shouldRetry(error)).toBe(false);
            },
        );

        it('does not retry unknown errors', () => {
            expect(
                policy.shouldRetry(new Error('Unknown error')),
            ).toBe(false);
        });
    });

    describe('getDelay', () => {
        it('uses exponential backoff for the first retry', () => {
            expect(
                policy.getDelay(
                    new HttpNetworkError('Network failure'),
                    0,
                ),
            ).toBe(1000);
        });

        it('uses exponential backoff for the second retry', () => {
            expect(
                policy.getDelay(
                    new HttpNetworkError('Network failure'),
                    1,
                ),
            ).toBe(2000);
        });

        it('uses exponential backoff for the third retry', () => {
            expect(
                policy.getDelay(
                    new HttpNetworkError('Network failure'),
                    2,
                ),
            ).toBe(4000);
        });

        it('uses exponential backoff for HTTP 500 errors', () => {
            const error = new HttpResponseError(
                500,
                new Headers(),
            );

            expect(policy.getDelay(error, 1)).toBe(2000);
        });

        it('uses Retry-After seconds for HTTP 429 errors', () => {
            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': '5',
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(5000);
        });

        it('uses the default delay when Retry-After is missing', () => {
            const error = new HttpResponseError(
                429,
                new Headers(),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });

        it('uses the default delay when Retry-After is invalid', () => {
            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': 'invalid-value',
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });

        it('enforces a minimum delay of one second when Retry-After is zero', () => {
            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': '0',
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });

        it('enforces a minimum delay of one second for short Retry-After values', () => {
            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': '0.5',
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });

        it('enforces a minimum delay of one second for negative Retry-After values', () => {
            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': '-5',
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });

        it('uses the HTTP date from Retry-After', () => {
            jest.spyOn(Date, 'now').mockReturnValue(10000);

            const retryDate = new Date(15000).toUTCString();

            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': retryDate,
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(5000);
        });

        it('enforces a minimum delay when the Retry-After date is in the past', () => {
            jest.spyOn(Date, 'now').mockReturnValue(20000);

            const retryDate = new Date(10000).toUTCString();

            const error = new HttpResponseError(
                429,
                new Headers({
                    'Retry-After': retryDate,
                }),
            );

            expect(policy.getDelay(error, 0)).toBe(1000);
        });
    });
});
