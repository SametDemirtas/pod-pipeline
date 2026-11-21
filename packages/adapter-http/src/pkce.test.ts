import * as crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPkcePair } from './pkce.js';

vi.mock('node:crypto', async (original) => {
  const actual = await original<typeof crypto>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const RFC_7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('PKCE', () => {
  it('derives the challenge as RFC 7636 describes', () => {
    vi.mocked(crypto.randomBytes).mockImplementationOnce(() =>
      Buffer.from(RFC_7636_VERIFIER, 'base64url'),
    );

    expect(createPkcePair()).toEqual({
      verifier: RFC_7636_VERIFIER,
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    });
  });

  it('makes a new verifier of a valid length each time', () => {
    const first = createPkcePair();
    const second = createPkcePair();

    expect(first.verifier).not.toBe(second.verifier);
    expect(first.verifier).toHaveLength(86);
  });
});
