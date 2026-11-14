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

    const first = limiter.execute(async () => {
      executionOrder.push(1);
    });

    const second = limiter.execute(async () => {
      executionOrder.push(2);
    });

    const third = limiter.execute(async () => {
      executionOrder.push(3);
    });

    await Promise.all([first, second, third]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('continues processing queued operations after one fails', async () => {
    const limiter = new RateLimiter(0);

    const first = limiter.execute(async () => {
      throw new Error('Operation failed');
    });

    const second = limiter.execute(async () => 'success');

    await expect(first).rejects.toThrow('Operation failed');
    await expect(second).resolves.toBe('success');
  });

  it('enforces the minimum interval between operations', async () => {
    const minInterval = 100;
    const limiter = new RateLimiter(minInterval);
    const startTimes: number[] = [];

    await limiter.execute(async () => {
      startTimes.push(Date.now());
    });

    await limiter.execute(async () => {
      startTimes.push(Date.now());
    });

    const elapsed = startTimes[1] - startTimes[0];

    expect(elapsed).toBeGreaterThanOrEqual(minInterval);
  });

  it('throws an error when minInterval is not finite', () => {
    expect(() => new RateLimiter(NaN)).toThrow(
      'minInterval must be a non-negative number',
    );

    expect(() => new RateLimiter(Infinity)).toThrow(
      'minInterval must be a non-negative number',
    );
  });
});
