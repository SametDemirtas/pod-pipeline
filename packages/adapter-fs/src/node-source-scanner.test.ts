import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeSourceScanner } from './node-source-scanner.js';
import { canRevokeAccess, isWindows, useTempFolder } from './testing/temp-folder.js';

const folder = useTempFolder('pod-fs-');

describe('NodeSourceScanner', () => {
  const scanner = new NodeSourceScanner();
  const relativePaths = async (depth = 1) =>
    (await scanner.scan(folder.path, depth)).files.map((file) => file.relativePath);

  it('lists files with forward-slash relative paths and sizes', async () => {
    folder.write('01. Tulip/Mug.png', 'abc');
    folder.write('02-mug.png', 'abcdef');

    expect((await scanner.scan(folder.path, 1)).files).toEqual([
      {
        relativePath: '01. Tulip/Mug.png',
        absolutePath: join(folder.path, '01. Tulip', 'Mug.png'),
        byteSize: 3,
      },
      { relativePath: '02-mug.png', absolutePath: join(folder.path, '02-mug.png'), byteSize: 6 },
    ]);
  });

  it('sorts by code unit, independent of locale', async () => {
    folder.write('b.png', 'x');
    folder.write('C.png', 'x');
    folder.write('a.png', 'x');

    expect(await relativePaths()).toEqual(['C.png', 'a.png', 'b.png']);
  });

  it('respects the depth limit', async () => {
    folder.write('a.png', 'x');
    folder.write('one/b.png', 'x');
    folder.write('one/two/c.png', 'x');

    expect(await scanner.scan(folder.path, 0)).toMatchObject({
      files: [{ relativePath: 'a.png' }],
      skipped: [{ relativePath: 'one', reason: 'too-deep' }],
    });
    expect(await scanner.scan(folder.path, 1)).toMatchObject({
      files: [{ relativePath: 'a.png' }, { relativePath: 'one/b.png' }],
      skipped: [{ relativePath: 'one/two', reason: 'too-deep' }],
    });
    folder.write('one/three/d.png', 'x');
    expect((await scanner.scan(folder.path, 1)).skipped.map((entry) => entry.relativePath)).toEqual(
      ['one/three', 'one/two'],
    );
  });

  it('skips hidden entries and operating system clutter', async () => {
    folder.write('.DS_Store', 'x');
    folder.write('.cache/a.png', 'x');
    folder.write('Thumbs.db', 'x');
    folder.write('DESKTOP.INI', 'x');
    folder.write('$RECYCLE.BIN/a.png', 'x');
    folder.write('System Volume Information/a.png', 'x');
    folder.write('__MACOSX/a.png', 'x');
    folder.write('visible.png', 'x');

    expect(await relativePaths()).toEqual(['visible.png']);
  });

  it('reports relative paths in NFC even when names are stored decomposed', async () => {
    folder.write(`${'01. Kırağı Bahçesi'.normalize('NFD')}/Mug.png`, 'x');

    const [file] = (await scanner.scan(folder.path, 1)).files;

    expect(file?.relativePath).toBe('01. Kırağı Bahçesi/Mug.png'.normalize('NFC'));
    expect(readFileSync(file?.absolutePath ?? '', 'utf8')).toBe('x');
  });

  it('does not follow links to folders or files outside the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'pod-outside-'));
    try {
      writeFileSync(join(outside, 'secret.png'), 'x');
      symlinkSync(outside, join(folder.path, '01. Linked'), isWindows ? 'junction' : 'dir');
      if (!isWindows) symlinkSync(join(outside, 'secret.png'), join(folder.path, '02-mug.png'));
      folder.write('03-mug.png', 'real');

      expect(await relativePaths()).toEqual(['03-mug.png']);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it.skipIf(!canRevokeAccess)('fails when the chosen folder itself cannot be read', async () => {
    chmodSync(folder.path, 0o000);
    try {
      await expect(scanner.scan(folder.path, 1)).rejects.toThrow(/EACCES/);
    } finally {
      chmodSync(folder.path, 0o755);
    }
  });

  it.skipIf(!canRevokeAccess)('reports a subfolder it is not allowed to read', async () => {
    folder.write('01. Locked/Mug.png', 'x');
    folder.write('02-mug.png', 'x');
    chmodSync(join(folder.path, '01. Locked'), 0o000);
    try {
      expect(await scanner.scan(folder.path, 1)).toMatchObject({
        files: [{ relativePath: '02-mug.png' }],
        skipped: [{ relativePath: '01. Locked', reason: 'unreadable' }],
      });
    } finally {
      chmodSync(join(folder.path, '01. Locked'), 0o755);
    }
  });

  it('fails for a missing folder or a file', async () => {
    await expect(scanner.scan(join(folder.path, 'missing'), 1)).rejects.toThrow(/ENOENT/);
    const file = folder.write('file.png', 'x');
    await expect(scanner.scan(file, 1)).rejects.toThrow(/is not a folder/);
  });
});
