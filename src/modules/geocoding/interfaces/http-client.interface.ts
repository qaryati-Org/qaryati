// Defines optional configuration for HTTP requests.
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

//Defines the structure of an HTTP response.
export interface HttpResponse {
  status: number;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
}

//Defines the contract for executing HTTP GET requests.
export interface HttpClient {
  get(url: URL, options?: HttpRequestOptions): Promise<HttpResponse>;
}
