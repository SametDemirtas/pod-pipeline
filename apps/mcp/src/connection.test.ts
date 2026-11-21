import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_API_CONNECTION_FILE, LOCAL_API_VERSION } from '@pod/contracts/client';
import {
  AppNotRunningError,
  AppVersionMismatchError,
  dataDirectory,
  readConnection,
} from './connection.js';

describe('dataDirectory', () => {
  it.each([
    [
      'darwin',
      '/Users/me',
      {},
      posix.join('/Users/me', 'Library', 'Application Support', 'POD Pipeline'),
    ],
    [
      'win32',
      'C:\\Users\\me',
      { APPDATA: 'D:\\Roaming' },
      win32.join('D:\\Roaming', 'POD Pipeline'),
    ],
    ['win32', 'C:\\Users\\me', {}, 'C:\\Users\\me\\AppData\\Roaming\\POD Pipeline'],
    ['win32', 'C:\\Users\\me', { APPDATA: '' }, 'C:\\Users\\me\\AppData\\Roaming\\POD Pipeline'],
    ['linux', '/home/me', { XDG_CONFIG_HOME: '/cfg' }, '/cfg/POD Pipeline'],
    ['linux', '/home/me', {}, '/home/me/.config/POD Pipeline'],
    ['linux', '/home/me', { XDG_CONFIG_HOME: '' }, '/home/me/.config/POD Pipeline'],
    ['darwin', '/Users/me', { POD_DATA_DIR: '/custom' }, '/custom'],
  ] as const)('on %s for %s with %j uses %s', (platform, home, variables, expected) => {
    expect(dataDirectory({ platform, home, variables })).toBe(expected);
  });
});

describe('readConnection', () => {
  let dir: string;
  const write = (contents: string) => {
    writeFileSync(join(dir, LOCAL_API_CONNECTION_FILE), contents);
  };
  const connection = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      apiVersion: LOCAL_API_VERSION,
      url: 'http://127.0.0.1:4321',
      token: 't',
      ...overrides,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-mcp-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the published connection', async () => {
    write(connection());

    expect(await readConnection(dir)).toEqual({
      apiVersion: LOCAL_API_VERSION,
      url: 'http://127.0.0.1:4321',
      token: 't',
    });
  });

  it.each([
    ['a missing file', null],
    ['invalid JSON', 'not json'],
    ['a list', '[]'],
    ['a numeric url', connection({ url: 1 })],
    ['a numeric token', connection({ token: 1 })],
    ['an empty token', connection({ token: '' })],
    ['a remote url', connection({ url: 'http://example.com:80' })],
    ['a url with a path', connection({ url: 'http://127.0.0.1:1/evil' })],
    ['https', connection({ url: 'https://127.0.0.1:1' })],
  ])('reports a closed app for %s', async (_case, contents) => {
    if (contents !== null) write(contents);

    await expect(readConnection(dir)).rejects.toBeInstanceOf(AppNotRunningError);
  });

  it('reports an app that speaks another API version', async () => {
    write(connection({ apiVersion: LOCAL_API_VERSION + 1 }));

    await expect(readConnection(dir)).rejects.toBeInstanceOf(AppVersionMismatchError);
  });
});
