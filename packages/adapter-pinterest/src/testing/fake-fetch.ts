import { signedInClient, type FakeReply } from '@pod/adapter-http/testing';
import { PinterestClient } from '../pinterest-client.js';
import { PinterestSession } from '../pinterest-session.js';

export const CREDENTIALS = { appId: '1500', appSecret: 'secret', refreshToken: 'refresh-1' };

export const TOKEN_REPLY: FakeReply = {
  body: { access_token: 'pina_access', refresh_token: 'refresh-2', expires_in: 2_592_000 },
};

/** A client whose first request also refreshes the access token. */
export function clientWith(...replies: FakeReply[]) {
  return signedInClient(
    {
      credentials: CREDENTIALS,
      tokenReply: TOKEN_REPLY,
      tokenPath: '/oauth/token',
      now: new Date('2026-10-26T10:00:00.000Z'),
      session: (parts) => new PinterestSession(parts),
      client: (parts) => new PinterestClient(parts),
    },
    replies,
  );
}
