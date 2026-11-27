import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth';
import { runWithAuditContext } from './audit-context';

// Registered globally by AuditModule. Interceptors run after the guards, so
// request.user is already known. The handler, and every database query it
// causes, runs inside this request's audit context.
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auditContext = {
      actorId: request.user?.id ?? null,
      correlationId: request.correlationId ?? null,
    };

    // Subscribing inside the context makes the handler start (and continue
    // after every await) with this context.
    return new Observable((subscriber) =>
      runWithAuditContext(auditContext, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
