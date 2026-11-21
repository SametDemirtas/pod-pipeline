import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileAtomically } from './write-file-atomically.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, rename: vi.fn(actual.rename), open: vi.fn(actual.open) };
});

const rename = vi.mocked(fs.rename);
const open = vi.mocked(fs.open);

function locked(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeFileAtomically', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-atomic-'));
    rename.mockClear();
    open.mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('replaces the file and leaves no temporary copy', async () => {
    const file = join(dir, 'settings.json');
    await writeFileAtomically(file, 'one');
    await writeFileAtomically(file, 'two');

    expect(readFileSync(file, 'utf8')).toBe('two');
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });

  it('flushes the file before renaming it, and the folder after', async () => {
    const file = join(dir, 'settings.json');
    const order: string[] = [];
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    open.mockImplementation(async (path, ...rest) => {
      const handle = await actual.open(path, ...rest);
      const name = String(path) === dir ? 'folder' : 'file';
      const datasync = handle.datasync.bind(handle);
      const sync = handle.sync.bind(handle);
      return Object.assign(handle, {
        datasync: () => {
          order.push(`${name} flushed`);
          return datasync();
        },
        sync: () => {
          order.push(`${name} flushed`);
          return sync();
        },
      });
    });
    rename.mockImplementationOnce(async (from, to) => {
      order.push('renamed');
      await actual.rename(from, to);
    });

    try {
      await writeFileAtomically(file, 'saved');
    } finally {
      open.mockImplementation(actual.open);
    }

    expect(readFileSync(file, 'utf8')).toBe('saved');
    expect(order).toEqual(
      process.platform === 'win32'
        ? ['file flushed', 'renamed']
        : ['file flushed', 'renamed', 'folder flushed'],
    );
  });

  it('still saves when the file system refuses to flush the folder', async () => {
    const file = join(dir, 'settings.json');
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    open.mockImplementation(async (path, ...rest) => {
      if (String(path) === dir) throw locked('EINVAL');
      return actual.open(path, ...rest);
    });

    try {
      await writeFileAtomically(file, 'saved');
    } finally {
      open.mockImplementation(actual.open);
    }

    expect(readFileSync(file, 'utf8')).toBe('saved');
  });

  it.skipIf(process.platform === 'win32')('applies the requested permissions', async () => {
    const file = join(dir, 'secret.json');
    await writeFileAtomically(file, '{}', 0o600);

    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('retries while the file is briefly locked', async () => {
    const file = join(dir, 'settings.json');
    rename.mockRejectedValueOnce(locked('EPERM')).mockRejectedValueOnce(locked('EBUSY'));

    await writeFileAtomically(file, 'saved');

    expect(readFileSync(file, 'utf8')).toBe('saved');
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it('gives up on other errors and cleans up', async () => {
    const target = join(dir, 'taken');
    mkdirSync(join(target, 'inside'), { recursive: true });

    await expect(writeFileAtomically(target, 'x')).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['taken']);
  });
});
