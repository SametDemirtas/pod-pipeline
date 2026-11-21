import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAnthropicKey } from './check-key.js';
import { fakeClaude } from './testing/fake-claude.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('checkAnthropicKey', () => {
  it('lists one model with the key', async () => {
    const { sent, fetchFn } = fakeClaude({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    await checkAnthropicKey('sk-test', fetchFn);

    expect(sent[0]?.url.split('?')[0]).toBe('https://api.anthropic.com/v1/models');
  });

  it('fails for a key Anthropic refuses', async () => {
    const { fetchFn } = fakeClaude(
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      401,
    );

    await expect(checkAnthropicKey('bad', fetchFn)).rejects.toThrow(/invalid x-api-key/);
  });

  it('asks Anthropic once, wherever the environment points the SDK', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://elsewhere.example');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'other-token');
    const { sent, fetchFn } = fakeClaude(
      { type: 'error', error: { type: 'api_error', message: 'overloaded' } },
      500,
    );

    await expect(checkAnthropicKey('sk-test', fetchFn)).rejects.toThrow(/overloaded/);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer sk-test');
  });
});
