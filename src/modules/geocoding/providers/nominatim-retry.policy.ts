import { Injectable } from '@nestjs/common';
import {
  HttpNetworkError,
  HttpResponseError,
} from '../http/http-client.errors';
import { RetryPolicy } from '../services/geocoding-retry.service';

@Injectable()
export class NominatimRetryPolicy implements RetryPolicy {
  readonly maxRetries = 3;

  shouldRetry(error: unknown): boolean {
    if (error instanceof HttpNetworkError) {
      return true;
    }

    if (error instanceof HttpResponseError) {
      return [429, 500, 502, 503, 504].includes(error.status);
    }

    return false;
  }

  getDelay(error: unknown, attempt: number): number {
    if (error instanceof HttpResponseError && error.status === 429) {
      return this.getRetryAfter(error);
    }

    return 1000 * 2 ** attempt;
  }

  private getRetryAfter(error: HttpResponseError): number {
    const retryAfter = error.headers.get('Retry-After');

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
}
