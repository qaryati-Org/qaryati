import { Injectable } from '@nestjs/common';

export interface RetryPolicy {
  maxRetries: number;
  shouldRetry(error: unknown): boolean;
  getDelay(error: unknown, attempt: number): number;
  onRetry?(error: unknown, attempt: number, delayMs: number): void;
}

@Injectable()
export class GeocodingRetryService {
  async execute<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
  ): Promise<T> {
    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const shouldRetry = policy.shouldRetry(error);

        if (!shouldRetry || attempt === policy.maxRetries) {
          throw error;
        }

        const delay = policy.getDelay(error, attempt);
        policy.onRetry?.(error, attempt, delay);

        await this.wait(delay);
      }
    }

    throw new Error('Retry execution failed unexpectedly');
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
