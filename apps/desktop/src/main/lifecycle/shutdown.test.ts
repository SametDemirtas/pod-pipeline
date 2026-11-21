import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_API_CONNECTION_FILE } from '@pod/contracts';
import { openLocalAccess } from '../local-api/local-access.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { createShutdown, serve, type ShutdownDeps } from './shutdown.js';

function setUp(overrides: Partial<ShutdownDeps> = {}) {
  const hide = vi.fn();
  const deps: ShutdownDeps = {
    settings: { get: () => Promise.resolve({ language: 'de' }) },
    defaultSettings: { language: 'en' },
    showNotice: vi.fn(() => hide),
    log: vi.fn(),
    ...overrides,
  };
  return { shutdown: createShutdown(deps), deps, hide };
}

describe('createShutdown', () => {
  it('closes each part in order once, with a notice in the seller language', async () => {
    const { shutdown, deps, hide } = setUp();
    const order: string[] = [];
    shutdown.add(() => {
      order.push('local access');
      return Promise.resolve();
    });
    shutdown.add(() => {
      order.push('services');
      return Promise.resolve();
    });

    expect(shutdown.isClosing()).toBe(false);
    const first = shutdown.shutDown();
    expect(shutdown.isClosing()).toBe(true);
    await Promise.all([first, shutdown.shutDown()]);

    expect(order).toEqual(['local access', 'services']);
    expect(deps.showNotice).toHaveBeenCalledOnce();
    expect(deps.showNotice).toHaveBeenCalledWith('de');
    expect(hide).toHaveBeenCalledOnce();
  });

  it('logs a part that fails and closes the rest', async () => {
    const failure = new Error('port in use');
    const { shutdown, deps, hide } = setUp({
      settings: { get: () => Promise.reject(new Error('unreadable')) },
    });
    const closed = vi.fn(() => Promise.resolve());
    shutdown.add(() => Promise.reject(failure));
    shutdown.add(closed);

    await shutdown.shutDown();

    expect(deps.log).toHaveBeenCalledWith(failure);
    expect(closed).toHaveBeenCalled();
    expect(deps.showNotice).toHaveBeenCalledWith('en');
    expect(hide).toHaveBeenCalled();
  });
});

describe('serve', () => {
  it('withdraws the connection file and closes the services when start-up fails after opening', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pod-serve-'));
    try {
      const { shutdown } = setUp();
      const closed: string[] = [];
      const failure = new Error('no window');
      const serving = serve(shutdown, {
        prepare: () => Promise.resolve(),
        openLocalAccess: async () => {
          const close = await openLocalAccess(dir, fakeCatalog(), vi.fn());
          expect(existsSync(join(dir, LOCAL_API_CONNECTION_FILE))).toBe(true);
          return async () => {
            await close();
            closed.push('local access');
          };
        },
        start: () => {
          throw failure;
        },
        closeServices: () => {
          closed.push('services');
          return Promise.resolve();
        },
      });

      await expect(serving).rejects.toBe(failure);
      expect(existsSync(join(dir, LOCAL_API_CONNECTION_FILE))).toBe(false);
      expect(closed).toEqual(['local access', 'services']);
      expect(shutdown.isClosing()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes the services when start-up fails before local access opened', async () => {
    const { shutdown } = setUp();
    const closeServices = vi.fn(() => Promise.resolve());
    const openAccess = vi.fn();

    await expect(
      serve(shutdown, {
        prepare: () => Promise.reject(new Error('protocol taken')),
        openLocalAccess: openAccess,
        start: vi.fn(),
        closeServices,
      }),
    ).rejects.toThrow('protocol taken');
    expect(openAccess).not.toHaveBeenCalled();
    expect(closeServices).toHaveBeenCalled();
  });
});
