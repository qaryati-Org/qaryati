// Review state of a record that needs a human decision before readers can
// rely on it (population, history, heritage).
export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}
