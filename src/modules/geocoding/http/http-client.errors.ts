export class HttpResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly headers: {
      get(name: string): string | null;
    },
  ) {
    super(`HTTP request failed: ${status}`);
    this.name = 'HttpResponseError';
  }
}

export class HttpNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'HttpNetworkError';
  }
}
