import { describe, expect, it } from 'vitest';
import { requestOAuthToken, type OAuthRefusal } from './oauth-token.js';

function answer(status: number, body: unknown) {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    sent.push({ url: input instanceof Request ? input.url : input.toString(), init });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  };
  return { sent, fetchFn };
}

const refused = (refusal: OAuthRefusal) => Object.assign(new Error('refused'), refusal);

describe('requestOAuthToken', () => {
  it('posts the form with the authorization and reads the token', async () => {
    const { sent, fetchFn } = answer(200, {
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
    });

    const token = await requestOAuthToken(fetchFn, {
      url: 'https://auth.test/token',
      form: { grant_type: 'refresh_token', refresh_token: 'old' },
      authorization: 'Basic abc',
      refused,
    });

    expect(token).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600 });
    expect(sent[0]?.init).toMatchObject({
      method: 'POST',
      body: 'grant_type=refresh_token&refresh_token=old',
      headers: { Authorization: 'Basic abc' },
    });
  });

  it("keeps its own timeout next to the caller's signal", async () => {
    const { sent, fetchFn } = answer(200, { access_token: 'a' });
    const cancel = new AbortController();

    await requestOAuthToken(fetchFn, { url: 'u', form: {}, signal: cancel.signal, refused });
    const signal = sent[0]?.init?.signal;
    expect(signal).not.toBe(cancel.signal);
    expect(signal?.aborted).toBe(false);
    cancel.abort();
    expect(signal?.aborted).toBe(true);
  });

  it('leaves out what the service did not send', async () => {
    const { fetchFn } = answer(200, { access_token: 'a' });

    expect(await requestOAuthToken(fetchFn, { url: 'u', form: {}, refused })).toEqual({
      accessToken: 'a',
      refreshToken: null,
      expiresInSeconds: null,
    });
  });

  it.each([
    [400, { error: 'invalid_grant', error_description: 'Expired' }, 'invalid_grant', 'Expired'],
    [401, { message: 'Bad app' }, undefined, 'Bad app'],
    [500, 'oops', undefined, undefined],
    [200, { token_type: 'bearer' }, undefined, undefined],
  ])('reports a refusal: %s %o', async (status, body, code, description) => {
    const { fetchFn } = answer(status, body);

    await expect(requestOAuthToken(fetchFn, { url: 'u', form: {}, refused })).rejects.toMatchObject(
      { status, code, description },
    );
  });
});
