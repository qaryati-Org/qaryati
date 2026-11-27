import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { Role } from './enums/role.enum';
import { hashPassword } from './password';

// Public registration only creates VIEWERs, so the first ADMIN comes from
// ADMIN_EMAIL / ADMIN_PASSWORD. Runs after migrations. An existing user with
// that email is never changed (no silent overwrite of a password or role).
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('auth.adminEmail', { infer: true });
    const password = this.config.get('auth.adminPassword', { infer: true });
    if (!email || !password) return;

    if (await this.users.findByEmail(email)) return;

    await this.users.create({
      email,
      passwordHash: await hashPassword(password),
      displayName: 'Administrator',
      role: Role.ADMIN,
    });
    // Log the event, never the email or password.
    this.logger.log('Created the initial admin account from ADMIN_EMAIL');
  }
}
