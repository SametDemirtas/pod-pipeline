import { Agent } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patientFetch } from './patient-fetch.js';

describe('patientFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the request without fetch’s own time limits, keeping the caller’s options', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const signal = AbortSignal.timeout(1_000);

    const response = await patientFetch('http://127.0.0.1:1/api/x', { method: 'POST', signal });

    expect(await response.text()).toBe('ok');
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:1/api/x', {
      method: 'POST',
      signal,
      dispatcher: expect.any(Agent) as unknown,
    });
  });
});
