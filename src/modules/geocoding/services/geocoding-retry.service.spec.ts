import { GeocodingRetryService, RetryPolicy } from './geocoding-retry.service';

describe('GeocodingRetryService', () => {
  let service: GeocodingRetryService;

  beforeEach(() => {
    service = new GeocodingRetryService();
  });

  it('returns the result when the operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const shouldRetry = jest.fn().mockReturnValue(true);
    const getDelay = jest.fn().mockReturnValue(0);

    const policy: RetryPolicy = {
      maxRetries: 3,
      shouldRetry,
      getDelay,
    };

    await expect(service.execute(operation, policy)).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it('retries when the operation fails with a retryable error', async () => {
    const error = new Error('Temporary failure');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    const shouldRetry = jest.fn().mockReturnValue(true);
    const getDelay = jest.fn().mockReturnValue(0);
    const onRetry = jest.fn();

    const policy: RetryPolicy = {
      maxRetries: 2,
      shouldRetry,
      getDelay,
      onRetry,
    };

    await expect(service.execute(operation, policy)).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(2);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
    expect(getDelay).toHaveBeenCalledWith(error, 0);
    expect(onRetry).toHaveBeenCalledWith(error, 0, 0);
  });

  it('stops immediately when the error is not retryable', async () => {
    const error = new Error('Invalid request');
    const operation = jest.fn().mockRejectedValue(error);

    const shouldRetry = jest.fn().mockReturnValue(false);
    const getDelay = jest.fn().mockReturnValue(0);
    const onRetry = jest.fn();

    const policy: RetryPolicy = {
      maxRetries: 3,
      shouldRetry,
      getDelay,
      onRetry,
    };

    await expect(service.execute(operation, policy)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(getDelay).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('throws the last error after all retry attempts fail', async () => {
    const error = new Error('Temporary failure');
    const operation = jest.fn().mockRejectedValue(error);

    const shouldRetry = jest.fn().mockReturnValue(true);
    const getDelay = jest.fn().mockReturnValue(0);
    const onRetry = jest.fn();

    const policy: RetryPolicy = {
      maxRetries: 2,
      shouldRetry,
      getDelay,
      onRetry,
    };

    await expect(service.execute(operation, policy)).rejects.toBe(error);

    // Initial attempt + 2 retries.
    expect(operation).toHaveBeenCalledTimes(3);
    expect(shouldRetry).toHaveBeenCalledTimes(3);

    // No delay is needed after the final failed attempt.
    expect(getDelay).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('passes the correct attempt number to the retry policy', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValueOnce('success');

    const shouldRetry = jest.fn().mockReturnValue(true);
    const getDelay = jest.fn().mockReturnValue(0);

    const policy: RetryPolicy = {
      maxRetries: 2,
      shouldRetry,
      getDelay,
    };

    await expect(service.execute(operation, policy)).resolves.toBe('success');

    expect(getDelay).toHaveBeenNthCalledWith(1, expect.any(Error), 0);
    expect(getDelay).toHaveBeenNthCalledWith(2, expect.any(Error), 1);
  });

  it('does not retry when maxRetries is zero', async () => {
    const error = new Error('Temporary failure');
    const operation = jest.fn().mockRejectedValue(error);

    const shouldRetry = jest.fn().mockReturnValue(true);
    const getDelay = jest.fn().mockReturnValue(0);

    const policy: RetryPolicy = {
      maxRetries: 0,
      shouldRetry,
      getDelay,
    };

    await expect(service.execute(operation, policy)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
    expect(getDelay).not.toHaveBeenCalled();
  });

  it('waits for the specified delay before retrying', async () => {
    jest.useFakeTimers();

    try {
      const error = new Error('Temporary failure');

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const shouldRetry = jest.fn().mockReturnValue(true);
      const getDelay = jest.fn().mockReturnValue(1000);
      const onRetry = jest.fn();

      const policy: RetryPolicy = {
        maxRetries: 1,
        shouldRetry,
        getDelay,
        onRetry,
      };

      const execution = service.execute(operation, policy);

      // Advance time to just before the retry delay expires.
      await jest.advanceTimersByTimeAsync(999);

      expect(operation).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(error, 0, 1000);

      // Complete the remaining 1 ms.
      await jest.advanceTimersByTimeAsync(1);

      await expect(execution).resolves.toBe('success');

      expect(operation).toHaveBeenCalledTimes(2);
      expect(getDelay).toHaveBeenCalledWith(error, 0);
    } finally {
      jest.useRealTimers();
    }
  });
});
