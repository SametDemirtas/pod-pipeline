import type {
  DesignId,
  Mockup,
  MockupId,
  MockupRepository,
  MockupSlot,
  ProductDetails,
  SceneCheck,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { integer, toMockup, toProductDetails } from './rows.js';

export class SqliteMockupRepository implements MockupRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  replace(designId: DesignId, slot: MockupSlot, mockups: readonly Mockup[]): Promise<void> {
    return this.gate(() => {
      this.db.atomically(() => {
        const batch = this.nextBatch(designId);
        this.db
          .prepare(
            `DELETE FROM mockups WHERE design_id = ? AND variant_id = ? AND print_area = ?
               AND scene_prompt IS NULL`,
          )
          .run(designId, slot.variantId, slot.printArea);
        mockups.forEach((mockup, position) => {
          this.insert(mockup, batch, position);
        });
      });
    });
  }

  add(mockups: readonly Mockup[]): Promise<void> {
    return this.gate(() => {
      this.db.atomically(() => {
        for (const designId of new Set(mockups.map((mockup) => mockup.designId))) {
          const batch = this.nextBatch(designId);
          mockups
            .filter((mockup) => mockup.designId === designId)
            .forEach((mockup, position) => {
              this.insert(mockup, batch, position);
            });
        }
      });
    });
  }

  saveCheck(designId: DesignId, id: MockupId, check: SceneCheck): Promise<void> {
    return this.gate(() => {
      // In one statement, so a confirmation given while the check ran is not lost.
      this.db
        .prepare(
          `UPDATE mockups SET scene_check_json = ?, print_confirmed = print_confirmed AND ?
             WHERE design_id = ? AND id = ?`,
        )
        .run(JSON.stringify(check), check.same ? 1 : 0, designId, id);
    });
  }

  setConfirmed(designId: DesignId, id: MockupId, confirmed: boolean): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare('UPDATE mockups SET print_confirmed = ? WHERE design_id = ? AND id = ?')
        .run(confirmed ? 1 : 0, designId, id);
    });
  }

  productDetails(designId: DesignId, id: MockupId): Promise<ProductDetails | null> {
    return this.gate(() => {
      const row = this.db
        .prepare('SELECT product_details_json FROM mockups WHERE design_id = ? AND id = ?')
        .get(designId, id);
      return row ? toProductDetails(row) : null;
    });
  }

  saveProductDetails(designId: DesignId, id: MockupId, details: ProductDetails): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare('UPDATE mockups SET product_details_json = ? WHERE design_id = ? AND id = ?')
        .run(JSON.stringify(details), designId, id);
    });
  }

  remove(designId: DesignId, id: MockupId): Promise<void> {
    return this.gate(() => {
      this.db.prepare('DELETE FROM mockups WHERE design_id = ? AND id = ?').run(designId, id);
    });
  }

  listForDesign(designId: DesignId): Promise<readonly Mockup[]> {
    return this.gate(() =>
      this.db
        .prepare('SELECT * FROM mockups WHERE design_id = ? ORDER BY batch DESC, position')
        .all(designId)
        .map(toMockup),
    );
  }

  private nextBatch(designId: DesignId): number {
    const last = this.db
      .prepare('SELECT MAX(batch) AS batch FROM mockups WHERE design_id = ?')
      .get(designId);
    return (last?.['batch'] === null || !last ? 0 : integer(last, 'batch')) + 1;
  }

  private insert(mockup: Mockup, batch: number, position: number): void {
    const { asset, sourceAsset: source } = mockup;
    this.db
      .prepare(
        `INSERT INTO mockups (
           id, design_id, design_revision, variant_id, print_area, view, scene_prompt,
           scene_look_json, scene_check_json, print_confirmed, batch, position, sha256,
           storage_key, mime_type, width, height, byte_size, created_at, source_sha256,
           source_storage_key, source_mime_type, source_width, source_height, source_byte_size
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mockup.id,
        mockup.designId,
        mockup.designRevision,
        mockup.variantId,
        mockup.printArea,
        mockup.view,
        mockup.scenePrompt,
        mockup.sceneLook ? JSON.stringify(mockup.sceneLook) : null,
        mockup.sceneCheck ? JSON.stringify(mockup.sceneCheck) : null,
        mockup.printConfirmed ? 1 : 0,
        batch,
        position,
        asset.sha256,
        asset.storageKey,
        asset.mimeType,
        asset.width,
        asset.height,
        asset.byteSize,
        mockup.createdAt.toISOString(),
        source?.sha256 ?? null,
        source?.storageKey ?? null,
        source?.mimeType ?? null,
        source?.width ?? null,
        source?.height ?? null,
        source?.byteSize ?? null,
      );
  }
}
