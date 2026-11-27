import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { Role } from './enums/role.enum';

describe('AdminBootstrapService', () => {
  let users: { findByEmail: jest.Mock; create: jest.Mock };

  function serviceWith(env: Record<string, string | undefined>) {
    const config = { get: (key: string) => env[key] };
    return new AdminBootstrapService(
      users as unknown as UsersService,
      config as unknown as ConfigService<AppConfig, true>,
    );
  }

  const adminEnv = {
    'auth.adminEmail': 'admin@example.com',
    'auth.adminPassword': 'a strong admin password',
  };

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
  });

  it('does nothing when no admin is configured', async () => {
    await serviceWith({}).onApplicationBootstrap();
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('creates an ADMIN with a hashed password', async () => {
    users.findByEmail.mockResolvedValue(null);
    await serviceWith(adminEnv).onApplicationBootstrap();

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        role: Role.ADMIN,
        passwordHash: expect.stringMatching(/^\$argon2id\$/),
      }),
    );
  });

  it('never changes an existing user with that email', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u-1', role: Role.VIEWER });
    await serviceWith(adminEnv).onApplicationBootstrap();
    expect(users.create).not.toHaveBeenCalled();
  });
});
