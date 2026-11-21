import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ImportSourceUnreadableError } from '@pod/core';
import { ImportFolderNotApprovedError } from '../errors/catalog-errors.js';
import type { PreferencesStore } from '../settings/preferences-store.js';

/**
 * Folders the user approved for importing by choosing them in the window.
 * Every client, including AI assistants, may only import from these folders
 * or from folders inside them. Paths are compared after resolving links.
 */
export class ImportFolderPolicy {
  constructor(
    private readonly file: PreferencesStore,
    /** Resolves links, so a folder reached through one is the same folder. */
    private readonly realpath: (path: string) => Promise<string>,
  ) {}

  async list(): Promise<readonly string[]> {
    return (await this.file.read()).importFolders ?? [];
  }

  /** Stores the folder by its real path and returns that path. */
  async approve(folder: string): Promise<string> {
    const real = await this.realpath(folder);
    await this.file.change((current) => {
      const folders = current.importFolders ?? [];
      return folders.includes(real) ? current : { ...current, importFolders: [...folders, real] };
    });
    return real;
  }

  async remove(folder: string): Promise<readonly string[]> {
    const real = await this.realpath(folder).catch(() => folder);
    const stored = await this.file.change((current) => ({
      ...current,
      importFolders: (current.importFolders ?? []).filter(
        (approved) => approved !== folder && approved !== real,
      ),
    }));
    return stored.importFolders ?? [];
  }

  /**
   * Returns the real path of `rootPath` if it is an approved folder or inside
   * one; callers must import from that path, not from the one they were given.
   * A path that cannot be resolved is refused, as unreadable only when it
   * would lie inside an approved folder, so nothing is revealed about others.
   */
  async resolveApproved(rootPath: string): Promise<string> {
    if (!isAbsolute(rootPath)) throw new ImportFolderNotApprovedError(rootPath);
    const approved = await this.list();
    const isApproved = (path: string) => approved.some((folder) => isSameOrInside(path, folder));

    let real: string;
    try {
      real = await this.realpath(rootPath);
    } catch (error) {
      if (isApproved(resolve(rootPath))) throw new ImportSourceUnreadableError(rootPath, error);
      throw new ImportFolderNotApprovedError(rootPath);
    }
    if (!isApproved(real)) throw new ImportFolderNotApprovedError(rootPath);
    return real;
  }
}

function isSameOrInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return !isAbsolute(fromFolder) && fromFolder.split(sep)[0] !== '..';
}
