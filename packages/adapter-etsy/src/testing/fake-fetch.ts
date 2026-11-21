import { signedInClient, type FakeReply } from '@pod/adapter-http/testing';
import { EtsyClient } from '../etsy-client.js';
import { EtsySession } from '../etsy-session.js';

/** The stored sign-in a test session starts with. */
export const CREDENTIALS = {
  keystring: 'key',
  sharedSecret: 'secret',
  refreshToken: 'refresh-1',
  shopId: '10001001',
};

export const TOKEN_REPLY: FakeReply = {
  body: { access_token: '1001001.access', refresh_token: 'refresh-2', expires_in: 3600 },
};

/** A client whose first request also refreshes the access token. */
export function clientWith(...replies: FakeReply[]) {
  return signedInClient(
    {
      credentials: CREDENTIALS,
      tokenReply: TOKEN_REPLY,
      tokenPath: '/oauth/token',
      now: new Date('2026-10-24T10:00:00.000Z'),
      session: (parts) => new EtsySession(parts),
      client: (parts) => new EtsyClient(parts),
    },
    replies,
  );
}
