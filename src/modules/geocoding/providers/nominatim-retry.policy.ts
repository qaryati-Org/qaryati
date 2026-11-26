import { Injectable, Logger } from '@nestjs/common';
import {
  HttpNetworkError,
  HttpResponseError,
} from '../http/http-client.errors';
import { RetryPolicy } from '../services/geocoding-retry.service';

@Injectable()
export class NominatimRetryPolicy implements RetryPolicy {
  private static readonly MAX_RETRY_AFTER_MS = 10_000;

  private readonly logger = new Logger(NominatimRetryPolicy.name);

  readonly maxRetries = 3;

  shouldRetry(error: unknown): boolean {
    if (error instanceof HttpNetworkError) {
      return true;
    }

    if (error instanceof HttpResponseError) {
      if (error.status === 429) {
        return (
          this.getRetryAfter(error) <= NominatimRetryPolicy.MAX_RETRY_AFTER_MS
        );
      }

      return [500, 502, 503, 504].includes(error.status);
    }

    return false;
  }

  getDelay(error: unknown, attempt: number): number {
    if (error instanceof HttpResponseError && error.status === 429) {
      return this.getRetryAfter(error);
    }

    return 1000 * 2 ** attempt;
  }

  onRetry(error: unknown, attempt: number, delayMs: number): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Nominatim retry attempt ${attempt + 1} scheduled after ${delayMs}ms: ${message}`,
    );
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
