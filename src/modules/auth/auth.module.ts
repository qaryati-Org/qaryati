import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './guards/roles.guard';

@Module({
  // APP_GUARD applies RolesGuard to every route, so other modules only add
  // @Roles(...) to their endpoints and never register the guard themselves.
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AuthModule {}
