# ADR-002: Authentication and Token Strategy

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** Lina, Rashad, Ahmad, Yahya

## Context

Qaryati is a backend-only REST API. Anyone may read verified village data,
but creating, editing, verifying and deleting records must be limited to
people with the right role (`VIEWER`, `EDITOR`, `VERIFIER`, `ADMIN`). The
reviewer of a record (`reviewed_by_id`) must be the real caller, never a
value the client sends.

The API is called by scripts, API-Dog and k6 load tests rather than a
browser application, it runs as one service (ADR-001), and it must be easy to
start with Docker without extra infrastructure.

We needed to decide how users prove who they are, how passwords are stored,
how long a login lasts, how a login can be ended, and how the first
administrator is created.

## Decision

### Passwords

- Hashed with **argon2id** (`argon2` library defaults: 64 MiB memory,
  3 passes, 4 lanes), above the OWASP minimum of 19 MiB and 2 passes.
- Length **12–128 characters**, no complexity rules, following NIST
  SP 800-63B. The upper bound keeps hashing cost predictable.
- The hash column is never selected by default (`select: false`), so it
  cannot reach a response by accident.
- Login returns the same `401 Invalid email or password` for an unknown
  email, a wrong password and a deactivated account. An unknown email is
  checked against a dummy hash, so response time does not reveal which
  emails are registered.

### Access tokens

- **JWT, HS256**, signed with `JWT_ACCESS_SECRET`, lifetime **15 minutes**
  (`JWT_ACCESS_TTL_SECONDS`). Verification only accepts HS256.
- Claims: `sub` (user id), `email`, `role`. Sent as
  `Authorization: Bearer <token>`.
- Not stored on the server: a request is authenticated by checking the
  signature and expiry, with no database lookup.

### Refresh tokens

- **Opaque random tokens** (256 bits, base64url), lifetime **7 days**
  (`JWT_REFRESH_TTL_SECONDS`), stored in `refresh_tokens` as a **SHA-256
  hash** only. A database leak therefore does not leak usable tokens.
- **Single use with rotation:** `POST /auth/refresh` revokes the presented
  token and returns a new access token and a new refresh token. The revoke is
  one conditional `UPDATE … WHERE revoked_at IS NULL AND expires_at > now()`,
  so two concurrent refreshes with the same token cannot both succeed.
- **Reuse detection:** tokens from one login share a `family_id`. If an
  already revoked token is presented again, every token in that family is
  revoked. Either the client has a bug or the token was stolen; in both cases
  the safe answer is to end that login.
- **Logout** revokes the whole family and is idempotent (`204` also for
  unknown tokens).
- Refresh re-reads the user, so a deactivated user cannot refresh and a role
  change takes effect at the next refresh.

### Authorization

- A global `JwtAuthGuard` runs first. No token: the request continues as
  anonymous, so public reads work. Invalid or expired token: `401`, never a
  silent fallback to anonymous.
- A global `RolesGuard` runs second and reads `@Roles(...)`. No `@Roles`:
  public. With `@Roles` and no token: `401`. With a role that is not listed:
  `403`. Roles are **not hierarchical**: every allowed role is listed, e.g.
  `@Roles(Role.EDITOR, Role.ADMIN)`. Other modules only add the decorator.
- Review endpoints take the reviewer from `@CurrentUser()`. Request bodies
  that try to set `reviewerId`, `reviewedById` or a role are rejected with
  `400` by the global whitelist validation.

### Accounts and secrets

- `POST /auth/register` always creates a `VIEWER`; a `role` field in the body
  is rejected (`400`).
- The **first `ADMIN`** is created at startup from `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` when no user has that email. An existing user is never
  changed, and the password is never logged.
- `JWT_ACCESS_SECRET` (at least 32 characters) is **required when
  `NODE_ENV=production`**; the app refuses to start without it. Development
  and test fall back to a fixed dev-only secret so every teammate's `.env`
  keeps working.
- `POST /auth/login` and `POST /auth/register` are **rate limited per IP**
  (`@nestjs/throttler`, default 5 requests per 60 seconds per endpoint,
  `AUTH_RATE_LIMIT`, `AUTH_RATE_LIMIT_TTL_SECONDS`), then `429`. The rest of
  the API is not limited by this.

## Alternatives considered

1. **Server-side sessions with a cookie.** Logout and revocation are instant,
   but every request needs a session lookup, and cookies bring CSRF handling
   that a non-browser API does not otherwise need.
2. **One long-lived JWT, no refresh token.** Simplest, but a stolen token
   works for its whole lifetime and logout cannot end it.
3. **Refresh tokens as stateless JWTs.** Nothing to store, but they cannot be
   revoked, rotated safely or checked for reuse.
4. **bcrypt instead of argon2id.** Widely used, but weaker against GPU
   cracking and limited to 72 bytes of password. argon2id is OWASP's first
   recommendation.
5. **RS256 (public/private key pair).** Useful when other services verify the
   tokens. With one service signing and verifying, HS256 with a strong secret
   is simpler.
6. **`@nestjs/passport` with `passport-jwt`.** We only need one strategy, so
   `@nestjs/jwt` in a small guard is less code and fewer dependencies.
7. **Short-lived JWT access tokens + stored, rotated opaque refresh tokens
   (selected).** Requests need no database lookup, a login can be ended, and
   a stolen refresh token is detected when it is reused.

## Consequences and limitations

- Most requests are verified from the token alone, which keeps the
  authenticated k6 write scenario free of auth lookups.
- Login is intentionally slow and memory-heavy (argon2id). The k6 write test
  should log in once per virtual user, not per request.
- **An access token cannot be revoked before it expires.** After logout or
  deactivation it keeps working for up to 15 minutes. A role change also
  only applies after the next refresh or login.
- The rate limit is kept **in memory**, so it is per app instance and resets
  on restart. Behind a reverse proxy, Express must trust the proxy
  (`trust proxy`) or all clients share the proxy's IP.
- There is no endpoint yet to change a user's role or deactivate a user;
  this is done in the database. Promoting users through the API is future
  work.
- `VIEWER` currently has no extra rights compared to an anonymous caller,
  because reads are public. The role exists for future non-public reads.
- Expired and revoked rows stay in `refresh_tokens`; a periodic clean-up job
  is future work.
- CORS is not enabled, so browser front ends on another origin are not
  supported yet. API clients, API-Dog and k6 are not affected.

See [docs/auth.md](../auth.md) for how to use the API, the
[auth module](../../src/modules/auth), the
[refresh token service](../../src/modules/auth/refresh-token.service.ts) and
the [roles guard](../../src/modules/auth/guards/roles.guard.ts).
