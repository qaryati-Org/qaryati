import { ConflictException } from '@nestjs/common';
import { VerificationStatus } from './verification-status.enum';

// PENDING -> VERIFIED | REJECTED (a verifier decides); VERIFIED -> REJECTED (an error is found later); REJECTED is final: submit a corrected record instead of reopening it.
const ALLOWED_TRANSITIONS: Readonly<
  Record<VerificationStatus, readonly VerificationStatus[]>
> = {
  [VerificationStatus.PENDING]: [
    VerificationStatus.VERIFIED,
    VerificationStatus.REJECTED,
  ],
  [VerificationStatus.VERIFIED]: [VerificationStatus.REJECTED],
  [VerificationStatus.REJECTED]: [],
};

export function canTransition(
  from: VerificationStatus,
  to: VerificationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: VerificationStatus,
  to: VerificationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(`A ${from} record cannot become ${to}`);
  }
}
