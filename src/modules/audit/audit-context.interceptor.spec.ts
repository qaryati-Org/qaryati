import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { Role } from '../auth/enums/role.enum';
import { AuditContext, currentAuditContext } from './audit-context';
import { AuditContextInterceptor } from './audit-context.interceptor';

describe('AuditContextInterceptor', () => {
  const interceptor = new AuditContextInterceptor();

  function httpContext(request: object, type = 'http'): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  // A handler that, like a real one, awaits before reading the context.
  const handlerReadingContext: CallHandler = {
    handle: () =>
      new Observable<AuditContext | undefined>((subscriber) => {
        void Promise.resolve().then(() => {
          subscriber.next(currentAuditContext());
          subscriber.complete();
        });
      }),
  };

  it('makes the caller and correlation id available to the handler', async () => {
    const request = {
      user: { id: 'u-1', email: 'e@example.com', role: Role.EDITOR },
      correlationId: 'corr-1',
    };

    const seen = await firstValueFrom(
      interceptor.intercept(httpContext(request), handlerReadingContext),
    );

    expect(seen).toEqual({ actorId: 'u-1', correlationId: 'corr-1' });
  });

  it('uses null for an anonymous caller', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(httpContext({}), handlerReadingContext),
    );

    expect(seen).toEqual({ actorId: null, correlationId: null });
  });

  it('does not leak the context outside the request', async () => {
    await firstValueFrom(
      interceptor.intercept(
        httpContext({ correlationId: 'corr-2' }),
        handlerReadingContext,
      ),
    );

    expect(currentAuditContext()).toBeUndefined();
  });

  it('leaves non-HTTP calls untouched', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(httpContext({}, 'rpc'), handlerReadingContext),
    );

    expect(seen).toBeUndefined();
  });
});
