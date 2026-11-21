import { describe, expect, it } from 'vitest';
import { checkGeminiKey } from './check-key.js';

describe('checkGeminiKey', () => {
  it('lists one model with the key, which costs nothing', async () => {
    const sent: Request[] = [];
    const fetchFn: typeof fetch = (input, init) => {
      sent.push(new Request(input, init));
      return Promise.resolve(Response.json({ models: [] }));
    };

    await checkGeminiKey('key-1', fetchFn);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('/models?pageSize=1');
  });

  it('refuses a key Gemini does not accept', async () => {
    const refused: typeof fetch = () =>
      Promise.resolve(Response.json({ error: { message: 'API key not valid' } }, { status: 400 }));

    await expect(checkGeminiKey('bad', refused)).rejects.toThrow(/API key not valid/);
  });
});
