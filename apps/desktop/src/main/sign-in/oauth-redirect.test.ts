import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForOAuthCode } from './oauth-redirect.js';

const OPTIONS = { service: 'Shop', path: '/oauth/redirect', port: 0 };

const waits: { close: () => void }[] = [];
afterEach(() => {
  for (const wait of waits.splice(0)) wait.close();
});

function wait(state: string, timeoutMs = 5_000) {
  const result = waitForOAuthCode(state, { ...OPTIONS, port: 0, timeoutMs });
  waits.push(result);
  return result;
}

const visit = (port: number, query: string) =>
  fetch(`http://localhost:${port}/oauth/redirect?${query}`);

describe('OAuth redirect', () => {
  it('accepts the code only with the state of this sign-in', async () => {
    const redirect = wait('state-1');
    const port = await redirect.listening;

    expect((await visit(port, 'code=stolen&state=other')).status).toBe(404);
    expect((await fetch(`http://localhost:${port}/other?state=state-1`)).status).toBe(404);
    const page = await visit(port, 'code=c0de&state=state-1');

    expect(await page.text()).toContain('Shop is connected');
    expect(await redirect.code).toBe('c0de');
  });

  it('reports a refusal and stops listening', async () => {
    const redirect = wait('s');
    const port = await redirect.listening;

    const page = await visit(port, 'error=access_denied&state=s');

    expect(await page.text()).toContain('did not allow access');
    await expect(redirect.code).rejects.toThrow('access_denied');
    await expect(visit(port, 'code=c&state=s')).rejects.toThrow();
  });

  it('gives up after the timeout', async () => {
    const redirect = wait('s', 20);
    await redirect.listening;

    await expect(redirect.code).rejects.toThrow('nobody allowed access on Shop in time');
  });

  it('reports a port that is taken', async () => {
    const first = wait('a');
    const port = await first.listening;
    const second = waitForOAuthCode('b', { ...OPTIONS, port });
    waits.push(second);

    await expect(second.listening).rejects.toThrow(/used by another program/);
    await expect(second.code).rejects.toThrow(/used by another program/);
  });

  it('answers on both loopback addresses, as localhost may lead to either', async () => {
    const redirect = wait('s');
    const port = await redirect.listening;

    const v4 = await fetch(`http://127.0.0.1:${port}/oauth/redirect?state=other`);
    const v6 = await fetch(`http://[::1]:${port}/oauth/redirect?code=c&state=s`);

    expect([v4.status, v6.status]).toEqual([404, 200]);
    expect(await redirect.code).toBe('c');
  });

  it('reports a port another program holds on the IPv6 address only', async () => {
    const other = createServer();
    await new Promise<void>((resolve) => other.listen(0, '::1', resolve));
    const address = other.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const redirect = waitForOAuthCode('s', { ...OPTIONS, port });
    waits.push(redirect);

    await expect(redirect.listening).rejects.toThrow(
      `port ${String(port)} is used by another program`,
    );
    other.close();
  });

  it('lets go of the port when closed before it was listening', async () => {
    const taken = wait('s');
    const port = await taken.listening;
    taken.close();
    const redirect = waitForOAuthCode('s', { ...OPTIONS, port });

    redirect.close();

    await expect(redirect.listening).rejects.toThrow('the sign-in was closed');
    const again = waitForOAuthCode('t', { ...OPTIONS, port });
    waits.push(again);
    expect(await again.listening).toBe(port);
  });

  it('stops waiting when the sign-in is cancelled', async () => {
    const cancel = new AbortController();
    const redirect = waitForOAuthCode('s', { ...OPTIONS, port: 0, signal: cancel.signal });
    waits.push(redirect);
    const port = await redirect.listening;

    cancel.abort();

    await expect(redirect.code).rejects.toBe(cancel.signal.reason);
    await expect(visit(port, 'code=c&state=s')).rejects.toThrow();
  });

  it('stops listening for a cancel once the sign-in is over', async () => {
    const cancel = new AbortController();
    const remove = vi.spyOn(cancel.signal, 'removeEventListener');
    const redirect = waitForOAuthCode('s', { ...OPTIONS, port: 0, signal: cancel.signal });
    waits.push(redirect);
    const port = await redirect.listening;

    await visit(port, 'code=c&state=s');

    expect(await redirect.code).toBe('c');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('refuses a sign-in cancelled before it began', async () => {
    const cancel = new AbortController();
    cancel.abort();
    const redirect = waitForOAuthCode('s', { ...OPTIONS, port: 0, signal: cancel.signal });
    waits.push(redirect);

    await expect(redirect.code).rejects.toBe(cancel.signal.reason);
  });
});
