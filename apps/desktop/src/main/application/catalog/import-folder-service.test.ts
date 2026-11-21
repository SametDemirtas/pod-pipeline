import { describe, expect, it, vi } from 'vitest';
import { ImportFolderService } from './import-folder-service.js';

function serviceWith(picked: string | null) {
  let folders: string[] = [];
  const policy = {
    list: () => Promise.resolve(folders),
    approve: vi.fn((folder: string) => {
      folders = [...folders, `/real${folder}`];
      return Promise.resolve(`/real${folder}`);
    }),
    remove: (folder: string) => {
      folders = folders.filter((approved) => approved !== folder);
      return Promise.resolve(folders);
    },
  };
  return { service: new ImportFolderService(policy, () => Promise.resolve(picked)), policy };
}

describe('ImportFolderService', () => {
  it('approves the chosen folder and lists it by its real path', async () => {
    const { service } = serviceWith('/designs');

    expect(await service.choose()).toBe('/real/designs');
    expect(await service.list()).toEqual(['/real/designs']);
    expect(await service.remove('/real/designs')).toEqual([]);
  });

  it('approves nothing when the seller cancels the picker', async () => {
    const { service, policy } = serviceWith(null);

    expect(await service.choose()).toBeNull();
    expect(policy.approve).not.toHaveBeenCalled();
  });
});
