import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../authenticated-user';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

@Roles(Role.ADMIN)
@Controller('test')
class TestController {
  @Get()
  @Roles(Role.EDITOR, Role.VERIFIER)
  withHandlerRoles() {}

  @Get()
  withClassRoles() {}
}

@Controller('open')
class OpenController {
  @Get()
  open() {}
}

function contextFor(
  controller: new () => object,
  handler: string,
  user?: AuthenticatedUser,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as Record<string, () => void>)[handler],
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('reads the roles set on the handler, overriding the class', () => {
    const ctx = contextFor(TestController, 'withHandlerRoles');
    expect(guard.getRequiredRoles(ctx)).toEqual([Role.EDITOR, Role.VERIFIER]);
  });

  it('falls back to the roles set on the controller class', () => {
    const ctx = contextFor(TestController, 'withClassRoles');
    expect(guard.getRequiredRoles(ctx)).toEqual([Role.ADMIN]);
  });

  it('returns no roles when @Roles() is not used', () => {
    expect(guard.getRequiredRoles(contextFor(OpenController, 'open'))).toEqual(
      [],
    );
  });

  const as = (role: Role): AuthenticatedUser => ({
    id: 'u-1',
    email: 'user@example.com',
    role,
  });

  it('lets anyone call an endpoint without @Roles()', () => {
    expect(guard.canActivate(contextFor(OpenController, 'open'))).toBe(true);
  });

  it('returns 401 for an anonymous caller on a protected endpoint', () => {
    expect(() =>
      guard.canActivate(contextFor(TestController, 'withHandlerRoles')),
    ).toThrow(UnauthorizedException);
  });

  it('returns 403 when the caller has none of the listed roles', () => {
    expect(() =>
      guard.canActivate(
        contextFor(TestController, 'withHandlerRoles', as(Role.VIEWER)),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not treat ADMIN as allowed unless it is listed', () => {
    expect(() =>
      guard.canActivate(
        contextFor(TestController, 'withHandlerRoles', as(Role.ADMIN)),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([Role.EDITOR, Role.VERIFIER])('allows a listed role (%s)', (role) => {
    expect(
      guard.canActivate(
        contextFor(TestController, 'withHandlerRoles', as(role)),
      ),
    ).toBe(true);
  });
});
