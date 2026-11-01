
export class RateLimiter {
  private lastRequestTime = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly minInterval: number = 1000) {
    if (!Number.isFinite(minInterval) || minInterval < 0) {
      throw new Error('minInterval must be a non-negative number');
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const elapsed = Date.now() - this.lastRequestTime;
      const waitTime = Math.max(0, this.minInterval - elapsed);

      if (waitTime > 0) {
        await this.delay(waitTime);
      }

      this.lastRequestTime = Date.now();

      return operation();
    });

    // Keep the queue working even if one request fails.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
