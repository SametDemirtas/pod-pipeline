import { NotFoundError, type DesignId, type MockupStore } from '@pod/core';

export interface PhotoSaverDeps {
  readonly mockups: Pick<MockupStore, 'listForDesign'>;
  /** Where the stored file of a storage key is on disk. */
  readonly pathOf: (storageKey: string) => string;
  /** Shows the system save dialog with this file name filled in; `null` when cancelled. */
  readonly pickSavePath: (fileName: string) => Promise<string | null>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
}

/** Saves a copy of a design's photo, at full size, where the seller chooses. */
export class PhotoSaver {
  constructor(private readonly deps: PhotoSaverDeps) {}

  /** `false` when the seller closed the save dialog without choosing a place. */
  async save(designId: string, mockupId: string): Promise<boolean> {
    const photos = await this.deps.mockups.listForDesign(designId as DesignId);
    const photo = photos.find((candidate) => candidate.id === mockupId);
    if (!photo) throw new NotFoundError('Mockup', mockupId);
    const target = await this.deps.pickSavePath(fileNameOf(photo.view, photo.asset));
    if (target === null) return false;
    await this.deps.copyFile(this.deps.pathOf(photo.asset.storageKey), target);
    return true;
  }
}

/** A plain name such as `scene-4621c1b5.jpg`, from the photo's view and content hash. */
export function fileNameOf(view: string, asset: { sha256: string; mimeType: string }): string {
  const slug =
    view
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'photo';
  const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
  return `${slug}-${asset.sha256.slice(0, 8)}.${extension}`;
}
