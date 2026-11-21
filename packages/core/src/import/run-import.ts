import type { ConceptId, DesignId } from '../catalog/model.js';
import { ImportNothingToDoError, ImportPlanChangedError, ValidationError } from '../errors.js';
import type { CatalogWriter, UnitOfWork } from '../ports/catalog-repositories.js';
import type { AssetStore, StoredAsset } from '../ports/files.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import type {
  ImportPlanner,
  ImportPreview,
  ImportPreviewItem,
  PreviewConcept,
  ProgressListener,
} from './import-preview.js';

export interface RunImportInput {
  readonly rootPath: string;
  /** Fingerprint of the preview the user confirmed. */
  readonly fingerprint: string;
}

export interface ImportResult {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly unchanged: number;
  readonly skipped: number;
  readonly renamedConceptKeys: readonly string[];
}

export interface RunImportDeps {
  readonly planner: ImportPlanner;
  readonly assets: AssetStore;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

interface StoredItem {
  readonly item: ImportPreviewItem;
  readonly asset: StoredAsset;
}

/**
 * Imports what a confirmed preview describes. Everything the preview relied
 * on is checked again inside the transaction, so a concurrent change makes
 * the whole import roll back instead of mixing two views of the catalog.
 */
export class RunImport {
  constructor(private readonly deps: RunImportDeps) {}

  async execute(input: RunImportInput, onProgress?: ProgressListener): Promise<ImportResult> {
    if (!input.fingerprint) throw new ValidationError('fingerprint', 'is required');

    const preview = await this.deps.planner.execute(input.rootPath, onProgress);
    if (preview.fingerprint !== input.fingerprint) throw new ImportPlanChangedError();

    const pending = preview.items.filter((item) => item.status !== 'unchanged');
    if (pending.length === 0 && preview.conceptRenames.length === 0) {
      throw new ImportNothingToDoError();
    }

    const stored = await this.copyFiles(pending, onProgress);
    return this.deps.unitOfWork.run((tx) => this.persist(tx, preview, stored));
  }

  /**
   * Copies files before the transaction: the store is content addressed, so a
   * failed transaction only leaves unreferenced copies behind.
   */
  private async copyFiles(
    pending: readonly ImportPreviewItem[],
    onProgress?: ProgressListener,
  ): Promise<StoredItem[]> {
    const stored: StoredItem[] = [];
    onProgress?.({ phase: 'copying', done: 0, total: pending.length });
    for (const item of pending) {
      const asset = await this.deps.assets.put(item.absolutePath, item.mimeType);
      if (asset.sha256 !== item.sha256) throw new ImportPlanChangedError();
      stored.push({ item, asset });
      onProgress?.({ phase: 'copying', done: stored.length, total: pending.length });
    }
    return stored;
  }

  private async persist(
    tx: CatalogWriter,
    preview: ImportPreview,
    stored: readonly StoredItem[],
  ): Promise<ImportResult> {
    const now = this.deps.clock.now();
    const created: string[] = [];
    const updated: string[] = [];

    for (const concept of preview.concepts) {
      const conceptId = await this.saveConcept(tx, preview, concept, now);
      for (const { item, asset } of stored) {
        if (item.conceptKey !== concept.conceptKey) continue;
        const isNew = await this.saveDesign(tx, item, asset, conceptId, now);
        (isNew ? created : updated).push(item.designKey);
      }
    }

    return {
      created,
      updated,
      unchanged: preview.counts.unchanged,
      skipped: preview.counts.skipped,
      renamedConceptKeys: preview.conceptRenames.map((rename) => rename.conceptKey),
    };
  }

  /** Creates or renames the concept after checking it is still what the preview saw. */
  private async saveConcept(
    tx: CatalogWriter,
    preview: ImportPreview,
    { conceptKey, name }: PreviewConcept,
    now: Date,
  ): Promise<ConceptId> {
    const existing = await tx.concepts.findByKey(conceptKey);
    const rename = preview.conceptRenames.find((entry) => entry.conceptKey === conceptKey);

    if (!existing) {
      const expectedExisting =
        rename !== undefined ||
        preview.items.some(
          (item) => item.conceptKey === conceptKey && item.currentRevision !== null,
        );
      if (expectedExisting) throw new ImportPlanChangedError();
      const id = this.deps.ids.next() as ConceptId;
      await tx.concepts.save({
        id,
        key: conceptKey,
        name,
        createdAt: now,
      });
      return id;
    }

    const expectedName = rename ? rename.from : (name ?? existing.name);
    if (existing.name !== expectedName) throw new ImportPlanChangedError();
    if (rename) await tx.concepts.save({ ...existing, name: rename.to });
    return existing.id;
  }

  /** Saves the next revision of a design; returns whether it is new. */
  private async saveDesign(
    tx: CatalogWriter,
    item: ImportPreviewItem,
    asset: StoredAsset,
    conceptId: ConceptId,
    now: Date,
  ): Promise<boolean> {
    const existing = await tx.designs.findByKey(item.designKey);
    if ((existing?.revision ?? null) !== item.currentRevision) throw new ImportPlanChangedError();

    await tx.designs.save({
      id: existing?.id ?? (this.deps.ids.next() as DesignId),
      designKey: item.designKey,
      conceptId,
      familyId: item.familyId,
      revision: (existing?.revision ?? 0) + 1,
      asset: {
        sha256: asset.sha256,
        storageKey: asset.storageKey,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        byteSize: asset.byteSize,
      },
      sourcePath: item.absolutePath,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return !existing;
  }
}
