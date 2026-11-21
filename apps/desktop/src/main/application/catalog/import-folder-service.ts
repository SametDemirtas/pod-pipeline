import type { ImportFolderPolicy } from './import-folder-policy.js';

/** The folders the seller approved for importing: listing, choosing and removing them. */
export class ImportFolderService {
  constructor(
    private readonly policy: Pick<ImportFolderPolicy, 'list' | 'approve' | 'remove'>,
    /** Shows the system folder picker; `null` when the seller cancels. */
    private readonly pickFolder: () => Promise<string | null>,
  ) {}

  list(): Promise<readonly string[]> {
    return this.policy.list();
  }

  /**
   * Lets the seller choose a folder and approves it. Returns the stored real
   * path, the same one the list shows, or `null` when cancelled.
   */
  async choose(): Promise<string | null> {
    const folder = await this.pickFolder();
    return folder === null ? null : this.policy.approve(folder);
  }

  remove(folder: string): Promise<readonly string[]> {
    return this.policy.remove(folder);
  }
}
