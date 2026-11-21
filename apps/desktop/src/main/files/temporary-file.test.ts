import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newTemporaryFile, temporaryFileWriter } from './temporary-file.js';

const dir = mkdtempSync(join(tmpdir(), 'pod-temp-'));
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('temporaryFileWriter', () => {
  it('writes into a folder it creates and removes the file when disposed', async () => {
    const write = temporaryFileWriter(join(dir, 'downloads'));

    const file = await write(new TextEncoder().encode('scene'));

    expect(readFileSync(file.absolutePath, 'utf8')).toBe('scene');
    expect(file.absolutePath.endsWith('.download')).toBe(true);
    await file.dispose();
    await file.dispose();
    expect(existsSync(file.absolutePath)).toBe(false);
  });
});

describe('newTemporaryFile', () => {
  it('ends the name with the extension a program reads the format from', async () => {
    const file = await newTemporaryFile(join(dir, 'downloads'), '.png');

    expect(file.absolutePath.endsWith('.download.png')).toBe(true);
    expect(existsSync(file.absolutePath)).toBe(false);
  });
});
