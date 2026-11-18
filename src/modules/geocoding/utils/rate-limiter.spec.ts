import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('throws an error when minInterval is negative', () => {
    expect(() => new RateLimiter(-100)).toThrow(
      'minInterval must be a non-negative number',
    );
  });

  it('executes an operation and returns its result', async () => {
    const limiter = new RateLimiter(0);
    const operation = jest.fn().mockResolvedValue('success');

    await expect(limiter.execute(operation)).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('executes queued operations in order', async () => {
    const limiter = new RateLimiter(0);
    const executionOrder: number[] = [];

    const first = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(1);
      }),
    );

    const second = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(2);
      }),
    );

    const third = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(3);
      }),
    );

    await Promise.all([first, second, third]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('continues processing queued operations after one fails', async () => {
    const limiter = new RateLimiter(0);
    const executionOrder: number[] = [];

    const first = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(1);
        throw new Error('Operation failed');
      }),
    );

    const second = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(2);
        return 'success';
      }),
    );

    const third = limiter.execute(() =>
      Promise.resolve().then(() => {
        executionOrder.push(3);
        return 'third success';
      }),
    );

    await expect(first).rejects.toThrow('Operation failed');
    await expect(second).resolves.toBe('success');
    await expect(third).resolves.toBe('third success');

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('enforces the minimum interval between operations', async () => {
    jest.useFakeTimers();

    try {
      const minInterval = 100;
      const limiter = new RateLimiter(minInterval);
      const startTimes: number[] = [];

      const first = limiter.execute(() =>
        Promise.resolve().then(() => {
          startTimes.push(Date.now());
        }),
      );

      const second = limiter.execute(() =>
        Promise.resolve().then(() => {
          startTimes.push(Date.now());
        }),
      );

      await jest.advanceTimersByTimeAsync(1000);

      await Promise.all([first, second]);

      const elapsed = startTimes[1] - startTimes[0];

      expect(startTimes).toHaveLength(2);
      expect(elapsed).toBeGreaterThanOrEqual(minInterval);
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws an error when minInterval is not finite', () => {
    expect(() => new RateLimiter(NaN)).toThrow(
      'minInterval must be a non-negative number',
    );

    expect(() => new RateLimiter(Infinity)).toThrow(
      'minInterval must be a non-negative number',
    );

    expect(() => new RateLimiter(-Infinity)).toThrow(
      'minInterval must be a non-negative number',
    );
  });
});
