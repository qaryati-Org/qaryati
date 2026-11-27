import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AccessTokenPayload } from './authenticated-user';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import {
  INVALID_REFRESH_TOKEN_MESSAGE,
  RefreshTokenService,
} from './refresh-token.service';

// One message for unknown email, wrong password and inactive account, so
// the response never reveals which emails are registered.
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // Public sign-up always creates a VIEWER; only an admin can grant more.
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.users.create({
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      displayName: dto.displayName,
    });
    return this.issueTokens(user, await this.refreshTokens.issue(user.id));
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(dto.email, true);
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await getDummyHash()),
      dto.password,
    );
    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return this.issueTokens(user, await this.refreshTokens.issue(user.id));
  }

  // Re-reads the user, so a deactivation or role change applies here.
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user?.isActive) {
      await this.refreshTokens.revoke(rotated.token);
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }
    return this.issueTokens(user, rotated.token);
  }

  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revoke(refreshToken);
  }

  private async issueTokens(
    user: User,
    refreshToken: string,
  ): Promise<AuthResponseDto> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('auth.accessTtlSeconds', { infer: true }),
      refreshToken,
      user: UserResponseDto.from(user),
    };
  }
}
