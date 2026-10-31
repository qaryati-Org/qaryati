import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
): ExecutionContext {
  return {
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

  // Temporary behaviour until JWT login exists.
  it.each([
    [TestController, 'withHandlerRoles'],
    [TestController, 'withClassRoles'],
    [OpenController, 'open'],
  ])('allows every request for now (%p.%s)', (controller, handler) => {
    expect(guard.canActivate(contextFor(controller, handler))).toBe(true);
  });
});
