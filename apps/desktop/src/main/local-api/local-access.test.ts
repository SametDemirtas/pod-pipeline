import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { openLocalAccess } from './local-access.js';

const close = vi.fn(() => Promise.resolve());

vi.mock('./local-api-server.js', () => ({
  startLocalApi: () => Promise.resolve({ url: 'http://127.0.0.1:1', close }),
}));

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

it('closes the API again when the connection cannot be published', async () => {
  dir = mkdtempSync(join(tmpdir(), 'pod-access-'));
  const notAFolder = join(dir, 'file');
  writeFileSync(notAFolder, '');

  await expect(openLocalAccess(notAFolder, fakeCatalog(), vi.fn())).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
});
