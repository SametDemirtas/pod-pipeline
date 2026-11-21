import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** 64 random bytes give an 86 character verifier, inside the 43 to 128 that PKCE allows. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(64).toString('base64url');
  return { verifier, challenge: pkceChallenge(verifier) };
}
