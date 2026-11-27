import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService, INVALID_CREDENTIALS_MESSAGE } from './auth.service';
import { Role } from './enums/role.enum';
import { hashPassword } from './password';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthService', () => {
  const password = 'correct horse battery';
  let passwordHash: string;
  let user: User;
  let users: { create: jest.Mock; findByEmail: jest.Mock; findById: jest.Mock };
  let refreshTokens: { issue: jest.Mock; rotate: jest.Mock; revoke: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let service: AuthService;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  beforeEach(() => {
    user = {
      id: 'u-1',
      email: 'lina@example.com',
      passwordHash,
      displayName: 'Lina',
      role: Role.EDITOR,
      isActive: true,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    };
    users = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    refreshTokens = {
      issue: jest.fn().mockResolvedValue('refresh-1'),
      rotate: jest.fn(),
      revoke: jest.fn(),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access-1') };
    const config = { get: jest.fn().mockReturnValue(900) };
    service = new AuthService(
      users as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService<AppConfig, true>,
    );
  });

  describe('register', () => {
    it('stores an argon2id hash, never the plain password', async () => {
      users.create.mockImplementation((input: Partial<User>) => ({
        ...user,
        ...input,
        role: Role.VIEWER,
      }));

      await service.register({
        email: 'lina@example.com',
        password,
        displayName: 'Lina',
      });

      const input = users.create.mock.calls[0][0];
      expect(input.passwordHash).toMatch(/^\$argon2id\$/);
      expect(input).not.toHaveProperty('password');
      expect(input).not.toHaveProperty('role');
    });
  });

  describe('login', () => {
    it('returns tokens and the user without its hash', async () => {
      users.findByEmail.mockResolvedValue(user);

      const res = await service.login({ email: user.email, password });

      expect(users.findByEmail).toHaveBeenCalledWith(user.email, true);
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'u-1',
        email: 'lina@example.com',
        role: Role.EDITOR,
      });
      expect(res).toMatchObject({
        accessToken: 'access-1',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshToken: 'refresh-1',
        user: { id: 'u-1', role: Role.EDITOR },
      });
      expect(res.user).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['a wrong password', () => user, 'wrong password!!'],
      ['an unknown email', () => null, password],
      ['an inactive account', () => ({ ...user, isActive: false }), password],
    ])(
      'rejects %s with the same message',
      async (_case, found: () => User | null, attempt) => {
        users.findByEmail.mockResolvedValue(found());
        const login = service.login({ email: user.email, password: attempt });
        await expect(login).rejects.toThrow(
          new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE),
        );
        expect(refreshTokens.issue).not.toHaveBeenCalled();
      },
    );
  });

  describe('refresh', () => {
    it('issues a new access token with the current role', async () => {
      refreshTokens.rotate.mockResolvedValue({
        userId: 'u-1',
        token: 'refresh-2',
      });
      users.findById.mockResolvedValue({ ...user, role: Role.VERIFIER });

      const res = await service.refresh('refresh-1');

      expect(res.refreshToken).toBe('refresh-2');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.VERIFIER }),
      );
    });

    it('rejects and revokes when the user was deactivated', async () => {
      refreshTokens.rotate.mockResolvedValue({
        userId: 'u-1',
        token: 'refresh-2',
      });
      users.findById.mockResolvedValue({ ...user, isActive: false });

      await expect(service.refresh('refresh-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-2');
    });
  });
});
