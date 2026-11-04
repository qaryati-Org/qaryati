import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { Role } from '../auth/enums/role.enum';
import { User } from './entities/user.entity';
import { normalizeEmail, UsersService } from './users.service';

function queryError(code: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error(), { code }),
  );
}

describe('UsersService', () => {
  let users: { create: jest.Mock; save: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    users = {
      create: jest.fn((input: Partial<User>) => input),
      save: jest.fn((user: Partial<User>) =>
        Promise.resolve({ id: 'u-1', ...user }),
      ),
    };
    service = new UsersService(users as unknown as Repository<User>);
  });

  it('normalizes emails to trimmed lowercase', () => {
    expect(normalizeEmail('  Lina@Example.COM ')).toBe('lina@example.com');
  });

  it('creates a user with a normalized email and VIEWER role by default', async () => {
    await service.create({
      email: ' Lina@Example.com',
      passwordHash: 'hash',
      displayName: ' Lina ',
    });

    expect(users.create).toHaveBeenCalledWith({
      email: 'lina@example.com',
      passwordHash: 'hash',
      displayName: 'Lina',
      role: Role.VIEWER,
    });
  });

  it('keeps an explicitly given role', async () => {
    const user = await service.create({
      email: 'admin@example.com',
      passwordHash: 'hash',
      displayName: 'Admin',
      role: Role.ADMIN,
    });
    expect(user.role).toBe(Role.ADMIN);
  });

  it('throws ConflictException when the email is already taken', async () => {
    users.save.mockRejectedValue(queryError('23505'));
    await expect(
      service.create({ email: 'a@b.c', passwordHash: 'h', displayName: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows other database errors unchanged', async () => {
    const error = queryError('23502');
    users.save.mockRejectedValue(error);
    await expect(
      service.create({ email: 'a@b.c', passwordHash: 'h', displayName: 'A' }),
    ).rejects.toBe(error);
  });
});
