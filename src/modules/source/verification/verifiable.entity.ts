import { Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { VerificationStatus } from './verification-status.enum';

// Base class for records that go through review. New records start PENDING.
// reviewedById identifies the reviewer; the audit log can record the full
// history of status changes.
export abstract class VerifiableEntity extends BaseEntity {
  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  status!: VerificationStatus;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById!: string | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote!: string | null;
}
