import type { MockupDto, RemoveMockupRequest, SavePhotoRequest } from '@pod/contracts';
import type { DesignId, MockupId, MockupStore } from '@pod/core';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toMockupDto } from '../dto/print-dtos.js';
import type { PhotoSaver } from './photo-saver.js';

export interface PhotoServiceDeps {
  readonly mockups: Pick<MockupStore, 'remove' | 'listForDesign'>;
  readonly saver: Pick<PhotoSaver, 'save'>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
}

/** A design's photos, which only the window removes or saves elsewhere. */
export class PhotoService {
  constructor(private readonly deps: PhotoServiceDeps) {}

  async removeMockup(request: RemoveMockupRequest): Promise<readonly MockupDto[]> {
    const designId = request.designId as DesignId;
    await this.deps.mockups.remove(designId, request.mockupId as MockupId);
    this.deps.events.catalogChanged();
    return (await this.deps.mockups.listForDesign(designId)).map(toMockupDto);
  }

  savePhoto(request: SavePhotoRequest): Promise<boolean> {
    return this.deps.saver.save(request.designId, request.mockupId);
  }
}
