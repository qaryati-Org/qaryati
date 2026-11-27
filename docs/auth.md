# Authentication and security

The `auth` and `users` modules handle accounts, login, tokens and
permissions. The design and its trade-offs are explained in
[ADR-002](adr/002-auth-and-token-strategy.md).

## Roles

| Role | Can do |
|---|---|
| anonymous / `VIEWER` | Read every public endpoint (`GET`) |
| `EDITOR` | Create and update records (new records start as `PENDING`) |
| `VERIFIER` | Verify or reject records |
| `ADMIN` | Everything above, plus delete records |

What each kind of endpoint requires:

| Endpoint | Required role |
|---|---|
| `GET` (lists, details, history, search) | none, public |
| `POST` / `PATCH` (create, update) | `EDITOR` or `ADMIN` |
| `DELETE` | `ADMIN` (except `DELETE /villages/:id/names/:nameId`: `EDITOR` or `ADMIN`) |
| `POST …/:id/verify`, `POST …/:id/reject` | `VERIFIER` or `ADMIN` |
| `/auth/*` | none (login, register, refresh, logout), except `GET /auth/me` |

Roles are not hierarchical: an endpoint lists every role it allows, e.g.
`@Roles(Role.EDITOR, Role.ADMIN)`. Public sign-up always creates a `VIEWER`;
other roles are given by an admin (see [Limitations](#limitations)).

## Using the API

```bash
# 1. Register (always role VIEWER), or log in
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"lina@example.com","password":"a long enough password"}'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "q3Vt…",
  "user": { "id": "…", "email": "lina@example.com", "displayName": "Lina", "role": "VIEWER", "isActive": true, "createdAt": "…" }
}
```

```bash
# 2. Call a protected endpoint with the access token
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 3. Before the access token expires (15 min), get new tokens.
#    The old refresh token stops working: always keep the newest one.
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

# 4. Log out (ends every token of this login)
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

In Swagger UI (`/api/docs`) or API-Dog, use **Authorize** / Bearer auth and
paste the access token.

### Endpoints

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /api/v1/auth/register` | `email`, `password` (12–128 chars), `displayName` | `201` tokens + user | `400` invalid input, `409` email taken, `429` too many attempts |
| `POST /api/v1/auth/login` | `email`, `password` | `200` tokens + user | `401` invalid email or password, `429` too many attempts |
| `POST /api/v1/auth/refresh` | `refreshToken` | `200` new tokens + user | `401` invalid, expired or reused token |
| `POST /api/v1/auth/logout` | `refreshToken` | `204` | none (unknown tokens are ignored) |
| `GET /api/v1/auth/me` | | `200` current user | `401` missing or invalid token |

### Error responses

All use the standard error format from the
[README](../README.md#api-conventions).

| Status | `code` | When |
|---|---|---|
| `401` | `UNAUTHORIZED` | Protected endpoint without a token, or an invalid / expired token on any endpoint |
| `403` | `FORBIDDEN` | Valid token, but the role is not allowed on this endpoint |
| `429` | `TOO_MANY_REQUESTS` | More than the allowed login or register attempts from one IP |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `JWT_ACCESS_SECRET` | dev-only value outside production | Signing secret, at least 32 characters. **Required when `NODE_ENV=production`** |
| `JWT_ACCESS_TTL_SECONDS` | `900` (15 min) | Access token lifetime |
| `JWT_REFRESH_TTL_SECONDS` | `604800` (7 days) | Refresh token lifetime |
| `AUTH_RATE_LIMIT` | `5` | Login or register requests per IP and window |
| `AUTH_RATE_LIMIT_TTL_SECONDS` | `60` | Rate limit window |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | not set | First admin, created at startup if no user has that email. Set both or neither |

Generate a production secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never commit real secrets: only `.env.example` with placeholders is in Git.

## Security measures

- **Passwords:** argon2id; the hash is never selected by default or returned.
- **Account enumeration:** one message for unknown email, wrong password and
  deactivated account, with the same response time.
- **Token theft:** short-lived access tokens; refresh tokens stored only as
  SHA-256 hashes, single use, and the whole login is revoked when an old one
  is reused.
- **Privilege escalation:** sign-up is always `VIEWER`; unknown body fields
  such as `role`, `reviewerId` or `reviewedById` are rejected (`400`); the
  reviewer of a record is always the token's user.
- **Brute force:** login and register are rate limited per IP.
- **Forged tokens:** only HS256 tokens signed with the server secret are
  accepted; an invalid token is rejected, never treated as anonymous.
- **Logs:** request bodies and headers are never logged, so passwords and
  tokens stay out of the logs. The admin bootstrap logs the event only.

## For developers

Protect an endpoint and get the caller:

```ts
import type { AuthenticatedUser } from '../auth';
import { CurrentUser, Role, Roles } from '../auth';

@Post(':id/verify')
@Roles(Role.VERIFIER, Role.ADMIN)
verify(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
  return this.service.verify(id, { reviewerId: user.id });
}
```

Use `import type` for `AuthenticatedUser`: it is an interface, and the
project compiles with `isolatedModules` and decorator metadata.

**E2E tests** ([test/utils/auth.ts](../test/utils/auth.ts)):

```ts
admin = await callerWithRole(app, Role.ADMIN); // fixed test user + token
await httpAs(app, admin).post('/api/v1/villages').send(body).expect(201);
```

`createTestApp()` raises the login rate limit for e2e runs;
`createTestApp({ authRateLimit: 3 })` lowers it to test `429`.

**Controller unit tests** ([test/utils/unit-auth.ts](../test/utils/unit-auth.ts)):
add `AUTH_TESTING_IMPORTS` and `AUTH_TESTING_PROVIDERS` to the testing module
and send `Authorization: bearerFor(Role.EDITOR)`.

## Limitations

- An access token keeps working until it expires (up to 15 minutes), even
  after logout or deactivation. A role change applies at the next refresh.
- There is no API yet to change a user's role or deactivate a user. An admin
  does it in the database, for example:
  `UPDATE users SET role = 'EDITOR' WHERE email = 'lina@example.com';`
- Deactivate users (`is_active = false`) instead of deleting them, because
  reviewed records reference them through `reviewed_by_id`.
- The rate limit is in memory: per instance, reset on restart.
- CORS is not enabled; browser apps on another origin cannot call the API yet.

See [ADR-002](adr/002-auth-and-token-strategy.md) for the reasoning behind
these choices.
