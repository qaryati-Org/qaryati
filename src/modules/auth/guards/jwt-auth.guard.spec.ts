import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest } from '../authenticated-user';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'x'.repeat(32) });
  const guard = new JwtAuthGuard(jwt);

  function contextWith(authorization?: string) {
    const request = {
      headers: authorization ? { authorization } : {},
    } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, context };
  }

  it('lets anonymous requests through without a user', async () => {
    const { request, context } = contextWith();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('attaches the user from a valid bearer token', async () => {
    const token = await jwt.signAsync({
      sub: 'u-1',
      email: 'lina@example.com',
      role: Role.EDITOR,
    });
    const { request, context } = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'u-1',
      email: 'lina@example.com',
      role: Role.EDITOR,
    });
  });

  it.each([
    ['a malformed header', 'Token abc'],
    ['a garbage token', 'Bearer not-a-jwt'],
  ])('rejects %s with 401', async (_case, header) => {
    await expect(
      guard.canActivate(contextWith(header).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'y'.repeat(32) }).signAsync({
      sub: 'u-1',
      role: Role.ADMIN,
    });
    await expect(
      guard.canActivate(contextWith(`Bearer ${forged}`).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync(
      { sub: 'u-1', role: Role.EDITOR },
      { expiresIn: -10 },
    );
    await expect(
      guard.canActivate(contextWith(`Bearer ${expired}`).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
