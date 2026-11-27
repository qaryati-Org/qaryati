import { AsyncLocalStorage } from 'async_hooks';

// Who is making the current request. Kept per request with AsyncLocalStorage,
// so code deep inside a service (and TypeORM) can read it without passing it
// through every method.
export interface AuditContext {
  actorId: string | null;
  correlationId: string | null;
}

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(context: AuditContext, fn: () => T): T {
  return storage.run(context, fn);
}

// Undefined outside a request (startup, migrations, seeds).
export function currentAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
