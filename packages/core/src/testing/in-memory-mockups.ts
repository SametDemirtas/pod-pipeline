import type { DesignId } from '../catalog/model.js';
import type { MockupRepository, MockupSlot } from '../ports/mockups.js';
import type { ProductDetails } from '../ports/product-reader.js';
import type { Mockup, MockupId, SceneCheck } from '../mockups/mockup.js';

export class InMemoryMockups implements MockupRepository {
  private stored: Mockup[] = [];
  /** By {@link photoKey}; removed with their photo. */
  private readonly details = new Map<string, ProductDetails>();

  replace(designId: DesignId, slot: MockupSlot, mockups: readonly Mockup[]): Promise<void> {
    const sameSlot = (old: Mockup) =>
      old.designId === designId &&
      old.variantId === slot.variantId &&
      old.printArea === slot.printArea &&
      old.scenePrompt === null;
    for (const old of this.stored.filter(sameSlot)) this.details.delete(photoKey(old));
    this.stored = [...mockups, ...this.stored.filter((old) => !sameSlot(old))];
    return Promise.resolve();
  }

  add(mockups: readonly Mockup[]): Promise<void> {
    this.stored = [...mockups, ...this.stored];
    return Promise.resolve();
  }

  saveCheck(designId: DesignId, id: MockupId, check: SceneCheck): Promise<void> {
    return this.change(designId, id, (old) => ({
      ...old,
      sceneCheck: check,
      printConfirmed: old.printConfirmed && check.same,
    }));
  }

  setConfirmed(designId: DesignId, id: MockupId, confirmed: boolean): Promise<void> {
    return this.change(designId, id, (old) => ({ ...old, printConfirmed: confirmed }));
  }

  productDetails(designId: DesignId, id: MockupId): Promise<ProductDetails | null> {
    return Promise.resolve(this.details.get(photoKey({ designId, id })) ?? null);
  }

  saveProductDetails(designId: DesignId, id: MockupId, details: ProductDetails): Promise<void> {
    if (this.stored.some((old) => old.designId === designId && old.id === id)) {
      this.details.set(photoKey({ designId, id }), details);
    }
    return Promise.resolve();
  }

  private change(designId: DesignId, id: MockupId, update: (old: Mockup) => Mockup) {
    this.stored = this.stored.map((old) =>
      old.designId === designId && old.id === id ? update(old) : old,
    );
    return Promise.resolve();
  }

  remove(designId: DesignId, id: MockupId): Promise<void> {
    this.details.delete(photoKey({ designId, id }));
    this.stored = this.stored.filter((old) => old.designId !== designId || old.id !== id);
    return Promise.resolve();
  }

  listForDesign(designId: DesignId): Promise<readonly Mockup[]> {
    return Promise.resolve(this.stored.filter((mockup) => mockup.designId === designId));
  }
}

function photoKey(photo: Pick<Mockup, 'designId' | 'id'>): string {
  return `${photo.designId}/${photo.id}`;
}
