import { vi } from 'vitest';
import { ConnectionSecrets } from '../application/connections/connection-secrets.js';
import type { ConnectionChecks } from '../application/connections/connection-checks.js';
import { ConnectionsService } from '../application/connections/connections-service.js';
import type { UnsavedSignIns } from '../application/connections/unsaved-sign-ins.js';
import { MemorySecrets } from './memory-secrets.js';

export let file: MemorySecrets;
type Mocked<T> = {
  [K in keyof T]: ReturnType<typeof vi.fn<Extract<T[K], (...args: never[]) => unknown>>>;
};

export let checks: Mocked<Omit<ConnectionChecks, 'dropbox' | 'signIns'>> & {
  dropbox: Mocked<ConnectionChecks['dropbox']>;
  signIns: Mocked<ConnectionChecks['signIns']>;
};
export let openExternal: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>;
export let connections: ConnectionsService;
export let unsaved: UnsavedSignIns;
export let clock: { now: ReturnType<typeof vi.fn<() => Date>> };

/** Fresh connections over memory secrets, with every check passing; run before each test. */
export function setUpConnections(): void {
  file = new MemorySecrets();
  checks = {
    printful: vi.fn(() =>
      Promise.resolve({ name: 'Example Store', syncsWithMarketplace: true, shopHandle: null }),
    ),
    s3: vi.fn(() => Promise.resolve()),
    dropbox: {
      createPkcePair: vi.fn(() => ({ verifier: 'verifier', challenge: 'challenge' })),
      authorizeUrl: vi.fn((appKey: string, challenge: string) => {
        return `https://dropbox.test/authorize?client_id=${appKey}&challenge=${challenge}`;
      }),
      refreshToken: vi.fn(() => Promise.resolve('refresh-token')),
    },
    aiKey: vi.fn(() => Promise.resolve()),
    signIns: {
      etsy: vi.fn(() =>
        Promise.resolve({ refreshToken: 'etsy-refresh', shopId: '10001001', shopName: 'Example' }),
      ),
      pinterest: vi.fn(() =>
        Promise.resolve({ refreshToken: 'pin-refresh', username: 'example-pins' }),
      ),
    },
  };
  clock = { now: vi.fn(() => new Date(1_000_000)) };
  openExternal = vi.fn(() => Promise.resolve());
  const secrets = new ConnectionSecrets(file);
  unsaved = secrets.unsavedSignIns;
  connections = new ConnectionsService({ secrets, checks, openExternal, clock });
}
