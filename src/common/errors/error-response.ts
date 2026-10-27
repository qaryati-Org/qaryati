// The single error format returned by every endpoint.
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    path: string;
    timestamp: string;
    correlationId?: string;
  };
}

export interface FieldError {
  field: string;
  messages: string[];
}

const CODES_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

export function codeForStatus(status: number): string {
  return (
    CODES_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR')
  );
}
