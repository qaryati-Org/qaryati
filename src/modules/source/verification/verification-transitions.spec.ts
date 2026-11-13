import { ConflictException } from '@nestjs/common';
import { VerificationStatus } from './verification-status.enum';
import { assertTransition, canTransition } from './verification-transitions';

const { PENDING, VERIFIED, REJECTED } = VerificationStatus;

describe('verification transitions', () => {
  it.each([
    [PENDING, PENDING, false],
    [PENDING, VERIFIED, true],
    [PENDING, REJECTED, true],
    [VERIFIED, PENDING, false],
    [VERIFIED, VERIFIED, false],
    [VERIFIED, REJECTED, true],
    [REJECTED, PENDING, false],
    [REJECTED, VERIFIED, false],
    [REJECTED, REJECTED, false],
  ])('%s -> %s is allowed: %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('does not throw when a pending record is verified', () => {
    expect(() => assertTransition(PENDING, VERIFIED)).not.toThrow();
  });

  it('throws ConflictException (409) when a rejected record is reopened', () => {
    expect(() => assertTransition(REJECTED, VERIFIED)).toThrow(
      ConflictException,
    );
    expect(() => assertTransition(REJECTED, VERIFIED)).toThrow(
      'A REJECTED record cannot become VERIFIED',
    );
  });
});
