import type { SQLInputValue } from 'node:sqlite';
import {
  assertValidDesign,
  ConflictError,
  NotFoundError,
  type Design,
  type DesignId,
  type DesignRepository,
  type KeptOrientation,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import type { Gate } from './gates.js';
import { text, toDesign } from './rows.js';

export class SqliteDesignRepository implements DesignRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly gate: Gate,
  ) {}

  findByKey(designKey: string): Promise<Design | undefined> {
    return this.gate(() => this.find(designKey));
  }

  save(design: Design): Promise<void> {
    return this.gate(() => {
      assertValidDesign(design);
      this.db.atomically(() => {
        this.assertSavable(design);
        this.write(design);
      });
    });
  }

  keepOrientation(id: DesignId, kept: KeptOrientation): Promise<void> {
    return this.gate(() => {
      const { changes } = this.db
        .prepare(
          `UPDATE designs SET orientation_kept_sha256 = ?, orientation_kept_reason = ?
           WHERE id = ?`,
        )
        .run(kept.sha256, kept.reason, id);
      if (Number(changes) === 0) throw new NotFoundError('Design', id);
    });
  }

  private find(designKey: string): Design | undefined {
    const row = this.db.prepare('SELECT * FROM designs WHERE design_key = ?').get(designKey);
    return row ? toDesign(row) : undefined;
  }

  private assertSavable(design: Design): void {
    if (!this.db.prepare('SELECT 1 FROM concepts WHERE id = ?').get(design.conceptId)) {
      throw new ConflictError(`Concept ${design.conceptId} does not exist`);
    }
    const current = this.find(design.designKey);
    if (current && current.id !== design.id) {
      throw new ConflictError(`Design key ${design.designKey} belongs to ${current.id}`);
    }
    const sameId = this.db.prepare('SELECT design_key FROM designs WHERE id = ?').get(design.id);
    if (sameId && text(sameId, 'design_key') !== design.designKey) {
      const storedKey = text(sameId, 'design_key');
      throw new ConflictError(`Design ${design.id} is stored under key ${storedKey}`);
    }
    const expected = (current?.revision ?? 0) + 1;
    if (design.revision !== expected) {
      throw new ConflictError(
        `Design ${design.designKey} must be saved as revision ${expected}, got ${design.revision}`,
      );
    }
  }

  private write(design: Design): void {
    const { asset } = design;
    const assetValues: SQLInputValue[] = [
      asset.sha256,
      asset.storageKey,
      asset.mimeType,
      asset.width,
      asset.height,
      asset.byteSize,
      design.sourcePath,
      design.upscale?.model ?? null,
      design.upscale?.originalSha256 ?? null,
      design.rotation?.degrees ?? null,
      design.rotation?.originalSha256 ?? null,
      design.rotation?.reason ?? null,
    ];
    this.db
      .prepare(
        `INSERT INTO designs (
           id, design_key, concept_id, family_id, revision, sha256, storage_key, mime_type,
           width, height, byte_size, source_path, upscale_model, upscale_from_sha256,
           rotation, rotation_from_sha256, rotation_reason, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           concept_id = excluded.concept_id, family_id = excluded.family_id,
           revision = excluded.revision, sha256 = excluded.sha256,
           storage_key = excluded.storage_key, mime_type = excluded.mime_type,
           width = excluded.width, height = excluded.height, byte_size = excluded.byte_size,
           source_path = excluded.source_path, upscale_model = excluded.upscale_model,
           upscale_from_sha256 = excluded.upscale_from_sha256, rotation = excluded.rotation,
           rotation_from_sha256 = excluded.rotation_from_sha256,
           rotation_reason = excluded.rotation_reason, updated_at = excluded.updated_at`,
      )
      .run(
        design.id,
        design.designKey,
        design.conceptId,
        design.familyId,
        design.revision,
        ...assetValues,
        design.createdAt.toISOString(),
        design.updatedAt.toISOString(),
      );
    this.db
      .prepare(
        `INSERT INTO design_revisions (
           design_id, revision, concept_id, family_id, sha256, storage_key, mime_type,
           width, height, byte_size, source_path, upscale_model, upscale_from_sha256,
           rotation, rotation_from_sha256, rotation_reason, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        design.id,
        design.revision,
        design.conceptId,
        design.familyId,
        ...assetValues,
        design.updatedAt.toISOString(),
      );
  }
}
