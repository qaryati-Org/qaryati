
import { Injectable } from '@nestjs/common';
import {
    HttpClient,
    HttpRequestOptions,
    HttpResponse,
} from '../interfaces/http-client.interface';
import {
    HttpNetworkError,
    HttpResponseError,
} from './http-client.errors';
import { RateLimiter } from '../utils/rate-limiter';

@Injectable()
export class FetchHttpClient implements HttpClient {
    private readonly rateLimiter = new RateLimiter(1000);

    async get(
        url: URL,
        options?: HttpRequestOptions,
    ): Promise<HttpResponse> {
        let response: Response;

        try {
            response = await this.rateLimiter.execute(async () => {
                return fetch(url, {
                    headers: options?.headers,
                    signal: AbortSignal.timeout(
                        options?.timeoutMs ?? 5000,
                    ),
                });
            });
        } catch (error) {
            this.handleNetworkError(error);
        }

        if (!response.ok) {
            throw new HttpResponseError(
                response.status,
                response.headers,
            );
        }

        return {
            status: response.status,
            headers: response.headers,
            json: async (): Promise<unknown> => {
                try {
                    return await response.json();
                } catch (error) {
                    this.handleNetworkError(error);
                }
            },
        };
    }

    private handleNetworkError(error: unknown): never {
        if (this.isNetworkError(error)) {
            throw new HttpNetworkError(error.message, error);
        }

        throw error;
    }

    private isNetworkError(error: unknown): error is Error {
        return (
            error instanceof TypeError ||
            (
                error instanceof DOMException &&
                (
                    error.name === 'TimeoutError' ||
                    error.name === 'AbortError'
                )
            )
        );
    }
}
