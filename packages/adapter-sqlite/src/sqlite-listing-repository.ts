import {
  ConflictError,
  type DesignId,
  type Listing,
  type ListingId,
  type ListingRepository,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { text, toListing, toListingProduct } from './rows.js';

const iso = (date: Date | null) => date?.toISOString() ?? null;

export class SqliteListingRepository implements ListingRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  save(listing: Listing): Promise<void> {
    return this.gate(() => {
      this.db.atomically(() => {
        const clash = this.db
          .prepare(
            'SELECT id FROM listings WHERE id <> ? AND (design_id = ? OR marketplace_id = ?)',
          )
          .get(listing.id, listing.designId, listing.marketplaceId);
        if (clash) throw new ConflictError(`Listing ${text(clash, 'id')} is in the way`);
        this.db
          .prepare(
            `INSERT INTO listings (
               id, design_id, design_revision, marketplace_id, state, print_area, fit,
               linked_at, created_at, published_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               design_revision = excluded.design_revision,
               marketplace_id = excluded.marketplace_id,
               state = excluded.state,
               print_area = excluded.print_area,
               fit = excluded.fit,
               linked_at = excluded.linked_at,
               published_at = excluded.published_at`,
          )
          .run(
            listing.id,
            listing.designId,
            listing.designRevision,
            listing.marketplaceId,
            listing.state,
            listing.printArea,
            listing.fit,
            iso(listing.linkedAt),
            listing.createdAt.toISOString(),
            iso(listing.publishedAt),
          );
        this.db.prepare('DELETE FROM listing_products WHERE listing_id = ?').run(listing.id);
        const insert = this.db.prepare(
          `INSERT INTO listing_products (listing_id, position, sku, product_id, variant_id)
           VALUES (?, ?, ?, ?, ?)`,
        );
        listing.products.forEach((product, position) => {
          insert.run(listing.id, position, product.sku, product.productId, product.variantId);
        });
      });
    });
  }

  remove(id: ListingId): Promise<void> {
    return this.gate(() => {
      this.db.prepare('DELETE FROM listings WHERE id = ?').run(id);
    });
  }

  findByDesign(designId: DesignId): Promise<Listing | undefined> {
    return this.gate(() => {
      const row = this.db.prepare('SELECT * FROM listings WHERE design_id = ?').get(designId);
      if (!row) return undefined;
      const products = this.db
        .prepare('SELECT * FROM listing_products WHERE listing_id = ? ORDER BY position')
        .all(text(row, 'id'))
        .map(toListingProduct);
      return toListing(row, products);
    });
  }
}
