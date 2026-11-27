import * as argon2 from 'argon2';

// argon2id with the library defaults (64 MiB memory, 3 passes, 4 lanes),
// which is above OWASP's minimum recommendation (19 MiB, 2 passes).
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed stored hash is treated as a wrong password, not a 500.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Login verifies against this when the email does not exist, so an unknown
// email takes as long as a wrong password and cannot be detected by timing.
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  return dummyHash;
}
