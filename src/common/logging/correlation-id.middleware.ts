import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}

// Reuses the caller's correlation id or creates one, so a request can be
// traced across logs and error responses.
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_HEADER);
    const id =
      incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  }
}
