import { describe, expect, it, vi } from 'vitest';
import { checkOpenAiCompatibleKey } from './check-key.js';
import { apiError, fakeOpenAi } from './testing/fake-openai.js';
import { DEEPSEEK, KIMI, OPENAI } from './vendors.js';

describe('checkOpenAiCompatibleKey', () => {
  it.each([
    [OPENAI, 'https://api.openai.com/v1/models'],
    [DEEPSEEK, 'https://api.deepseek.com/models'],
    [KIMI, 'https://api.moonshot.ai/v1/models'],
  ])("lists the vendor's models with the key", async (vendor, url) => {
    const { sent, fetchFn } = fakeOpenAi({ object: 'list', data: [] });

    await checkOpenAiCompatibleKey(vendor, 'sk-test', fetchFn);

    expect(sent[0]?.url).toBe(url);
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer sk-test');
  });

  it('fails once for a key the vendor refuses, naming the vendor', async () => {
    const { sent, fetchFn } = fakeOpenAi(apiError('Incorrect API key provided'), 401);

    await expect(checkOpenAiCompatibleKey(KIMI, 'bad', fetchFn)).rejects.toMatchObject({
      service: 'Kimi',
      message: expect.stringContaining('Incorrect API key') as string,
    });
    expect(sent).toHaveLength(1);
  });

  it('leaves organization and project ids from the environment out', async () => {
    vi.stubEnv('OPENAI_ORG_ID', 'org-elsewhere');
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj-elsewhere');
    const { sent, fetchFn } = fakeOpenAi({ object: 'list', data: [] });

    await checkOpenAiCompatibleKey(DEEPSEEK, 'k', fetchFn).finally(() => vi.unstubAllEnvs());

    expect(sent[0]?.headers.get('openai-organization')).toBeNull();
    expect(sent[0]?.headers.get('openai-project')).toBeNull();
  });
});
