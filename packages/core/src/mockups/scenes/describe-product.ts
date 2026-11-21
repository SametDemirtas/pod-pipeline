import { requireDesign } from '../../catalog/catalog-queries.js';
import { productTypeOf } from '../../catalog/product-family.js';
import type { DesignId } from '../../catalog/model.js';
import type { CatalogQuery } from '../../ports/catalog-repositories.js';
import type { MockupStore, ProductDetailsStore } from '../../ports/mockups.js';
import type { ImagePreviews } from '../../ports/previews.js';
import type { ProductDetails, ProductReader } from '../../ports/product-reader.js';
import { requireProviderPhoto } from '../require-mockup.js';

export interface DescribeProductInput {
  readonly designId: string;
  readonly mockupId: string;
}

export interface DescribeProductDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly mockups: Pick<MockupStore, 'listForDesign'> & ProductDetailsStore;
  readonly previews: ImagePreviews;
  readonly reader: ProductReader;
}

/**
 * Reads what the product in one of the print provider's photos looks like and
 * keeps it with the photo, so each photo is read once for all its scenes.
 */
export class DescribeProduct {
  constructor(private readonly deps: DescribeProductDeps) {}

  async execute(input: DescribeProductInput): Promise<ProductDetails> {
    const designId = input.designId as DesignId;
    const { mockups } = this.deps;
    const photo = await requireProviderPhoto(mockups, designId, input.mockupId);
    const known = await mockups.productDetails(designId, photo.id);
    if (known) return known;

    const { design } = await requireDesign(this.deps.query, designId);
    const details = await this.deps.reader.read(
      await this.deps.previews.preview(photo.asset),
      productTypeOf(design.familyId),
    );
    await mockups.saveProductDetails(designId, photo.id, details);
    return details;
  }
}
