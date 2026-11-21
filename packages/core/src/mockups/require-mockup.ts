import { isPublishablePhoto } from '@pod/rules';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError, ValidationError } from '../errors.js';
import type { MockupStore } from '../ports/mockups.js';
import type { Mockup } from './mockup.js';

/** The design's photo with this id, or `NotFoundError` when it has none. */
export async function requireMockup(
  mockups: Pick<MockupStore, 'listForDesign'>,
  designId: DesignId,
  id: string,
): Promise<Mockup> {
  const mockup = (await mockups.listForDesign(designId)).find((candidate) => candidate.id === id);
  if (!mockup) throw new NotFoundError('Mockup', id);
  return mockup;
}

/** Like {@link requireMockup}, refusing a scene: scenes are made from the print provider's photos. */
export async function requireProviderPhoto(
  mockups: Pick<MockupStore, 'listForDesign'>,
  designId: DesignId,
  id: string,
): Promise<Mockup> {
  const photo = await requireMockup(mockups, designId, id);
  if (photo.scenePrompt !== null) {
    throw new ValidationError('mockupId', "build scenes from the print provider's photos");
  }
  return photo;
}

/**
 * The photo with this id among `photos`, refusing one of an earlier revision
 * of the design, which shows other artwork, and a scene whose print the
 * seller has not confirmed.
 */
export function requirePublishablePhoto(
  photos: readonly Mockup[],
  id: string,
  field: string,
  revision: number,
): Mockup {
  const photo = photos.find((candidate) => candidate.id === id);
  if (!photo) throw new NotFoundError('Mockup', id);
  if (photo.designRevision !== revision) {
    throw new ValidationError(field, `photo ${id} shows an earlier version of the artwork`);
  }
  if (!isPublishablePhoto(photo)) {
    throw new ValidationError(field, `confirm the print of scene ${id} first`);
  }
  return photo;
}
