import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { RefreshToken } from './entities/refresh-token.entity';

export const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid or expired refresh token';

export function hashRefreshToken(token: string): string {
  // The token is 256 random bits, so a fast hash is enough (no brute force
  // is possible); argon2 is only needed for low-entropy passwords.
  return createHash('sha256').update(token).digest('hex');
}

export interface RotatedRefreshToken {
  userId: string;
  token: string;
}

// Opaque refresh tokens, stored hashed and rotated on every use.
@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // Starts a new family (a fresh login) unless familyId is given (rotation).
  async issue(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlSeconds = this.config.get('auth.refreshTtlSeconds', {
      infer: true,
    });
    await this.tokens.insert({
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      revokedAt: null,
    });
    return token;
  }

  // Revokes the presented token and issues its replacement in the same
  // family. The revoke is a single conditional UPDATE, so two concurrent
  // refreshes with the same token cannot both succeed.
  async rotate(token: string): Promise<RotatedRefreshToken> {
    const tokenHash = hashRefreshToken(token);
    const result = await this.tokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: () => 'now()' })
      .where('token_hash = :tokenHash', { tokenHash })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > now()')
      // A raw column list: the array form expects entity property names
      // and silently drops anything else.
      .returning('user_id, family_id')
      .execute();

    const row = (result.raw as { user_id: string; family_id: string }[])[0];
    if (!row) {
      await this.revokeFamilyIfReused(tokenHash);
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }
    return {
      userId: row.user_id,
      token: await this.issue(row.user_id, row.family_id),
    };
  }

  // Logout: revokes the whole family, so every token from that login stops
  // working. Unknown tokens are ignored (logout is idempotent).
  async revoke(token: string): Promise<void> {
    const existing = await this.tokens.findOne({
      where: { tokenHash: hashRefreshToken(token) },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  // A known token that was already revoked is being reused: either the
  // client has a bug or the token was stolen. Revoke the whole family so
  // the attacker's copy (or the victim's) stops working too.
  private async revokeFamilyIfReused(tokenHash: string): Promise<void> {
    const reused = await this.tokens.findOne({ where: { tokenHash } });
    if (reused?.revokedAt) await this.revokeFamily(reused.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: () => 'now()' },
    );
  }
}
