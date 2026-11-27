import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per issued refresh token. Only a SHA-256 hash of the token is
// stored, so a database leak does not leak usable tokens. Tokens issued from
// the same login share a family_id: when a revoked token is reused, the whole
// family is revoked (the token was probably stolen).
// Constraint names match the migration so `migration:generate` sees no drift.
@Entity('refresh_tokens')
@Unique('uq_refresh_tokens_token_hash', ['tokenHash'])
@Index('idx_refresh_tokens_user_id', ['userId'])
@Index('idx_refresh_tokens_family_id', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'refresh_tokens_user_id_fkey',
  })
  user?: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
