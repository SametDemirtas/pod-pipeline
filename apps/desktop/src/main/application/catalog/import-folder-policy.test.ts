import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportSourceUnreadableError } from '@pod/core';
import { MemoryPreferences } from '../../testing/memory-preferences.js';
import { ImportFolderNotApprovedError } from '../errors/catalog-errors.js';
import { ImportFolderPolicy } from './import-folder-policy.js';

let dir: string;
let preferences: MemoryPreferences;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-folders-'));
  preferences = new MemoryPreferences();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('ImportFolderPolicy', () => {
  let approved: string;
  let policy: ImportFolderPolicy;

  beforeEach(async () => {
    mkdirSync(join(dir, 'designs', 'winter'), { recursive: true });
    mkdirSync(join(dir, 'private'));
    approved = await realpath(join(dir, 'designs'));
    policy = new ImportFolderPolicy(preferences, realpath);
  });

  it('approves a folder once, by its real path, next to the settings', async () => {
    await preferences.change(() => ({ language: 'de' }));

    expect(await policy.approve(join(dir, 'designs'))).toBe(approved);
    expect(await policy.approve(`${join(dir, 'designs')}/`)).toBe(approved);
    expect(await preferences.read()).toEqual({ language: 'de', importFolders: [approved] });
    expect(await policy.list()).toEqual([approved]);
  });

  it('allows the approved folder and folders inside it', async () => {
    await policy.approve(join(dir, 'designs'));

    await expect(policy.resolveApproved(join(dir, 'designs'))).resolves.toBe(approved);
    await expect(policy.resolveApproved(join(dir, 'designs', 'winter'))).resolves.toBe(
      join(approved, 'winter'),
    );
  });

  it('reports a missing folder inside an approved one as unreadable', async () => {
    await policy.approve(join(dir, 'designs'));

    await expect(policy.resolveApproved(join(approved, 'missing'))).rejects.toBeInstanceOf(
      ImportSourceUnreadableError,
    );
    await expect(policy.resolveApproved(join(dir, 'missing'))).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );
  });

  it.each([
    ['a folder outside', () => join(dir, 'private')],
    ['a sibling whose name starts the same', () => join(dir, 'designs-old')],
    ['a path escaping with ..', () => join(dir, 'designs', '..', 'private')],
    ['a relative path', () => 'designs'],
  ])('refuses %s', async (_case, path) => {
    await policy.approve(join(dir, 'designs'));

    await expect(policy.resolveApproved(path())).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );
  });

  it.skipIf(process.platform === 'win32')('refuses a link that leads outside', async () => {
    await policy.approve(join(dir, 'designs'));
    symlinkSync(join(dir, 'private'), join(dir, 'designs', 'link'));

    await expect(policy.resolveApproved(join(dir, 'designs', 'link'))).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );
  });

  it('refuses everything until a folder is approved, and again after removal', async () => {
    await expect(policy.resolveApproved(join(dir, 'designs'))).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );

    await policy.approve(join(dir, 'designs'));
    expect(await policy.remove(join(dir, 'designs'))).toEqual([]);

    await expect(policy.resolveApproved(join(dir, 'designs'))).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );
  });

  it('removes a folder that no longer exists by its stored path', async () => {
    await policy.approve(join(dir, 'designs'));
    rmSync(join(dir, 'designs'), { recursive: true });

    expect(await policy.remove(approved)).toEqual([]);
  });

  it('fails to approve a folder that does not exist', async () => {
    await expect(policy.approve(join(dir, 'missing'))).rejects.toThrow(/ENOENT/);
  });
});
