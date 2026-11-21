import { importedSha256 } from '../catalog/model.js';
import { ImportSourceUnreadableError, ValidationError } from '../errors.js';
import { compareCodeUnits } from '../ordering.js';
import type { ConceptRepository, DesignRepository } from '../ports/catalog-repositories.js';
import type {
  Hasher,
  ImageInfo,
  ImageInspector,
  ScanResult,
  SourceScanner,
} from '../ports/files.js';
import type { ArtworkSharing } from '../ports/files.js';
import type { ImportLayout, PlannedDesign } from './import-layout.js';
import { ImageTooLargeError, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../catalog/image-limits.js';
import {
  type ConceptRename,
  type ImportItemStatus,
  type ImportPlanner,
  type ImportPreview,
  type ImportPreviewItem,
  type PreviewConcept,
  type ProgressListener,
  type SkippedFile,
} from './import-preview.js';

export interface PreviewImportDeps {
  readonly scanner: SourceScanner;
  readonly layout: ImportLayout;
  readonly inspector: ImageInspector;
  readonly hasher: Hasher;
  readonly designs: Pick<DesignRepository, 'findByKey'>;
  readonly concepts: Pick<ConceptRepository, 'findByKey'>;
  readonly artwork: ArtworkSharing;
}

/** Describes what importing a folder would do, without writing anything. */
export class PreviewImport implements ImportPlanner {
  constructor(private readonly deps: PreviewImportDeps) {}

  async execute(rootPath: string, onProgress?: ProgressListener): Promise<ImportPreview> {
    if (!rootPath.trim()) throw new ValidationError('rootPath', 'is required');

    const scan = await this.scan(rootPath);
    const layout = this.deps.layout.interpret(scan.files, {
      shareArtwork: await this.deps.artwork.shared(),
    });
    const items: ImportPreviewItem[] = [];
    const skipped: SkippedFile[] = [...scan.skipped, ...layout.skipped];
    const total = layout.planned.length;
    onProgress?.({ phase: 'reading', done: 0, total });

    // Designs made from one shared file read it once.
    const read = new Map<string, Promise<FileRead>>();
    for (const [index, planned] of layout.planned.entries()) {
      const outcome = await this.describe(planned, read);
      // A file several designs are made from is skipped once.
      const listed =
        'reason' in outcome &&
        skipped.some(({ relativePath }) => relativePath === outcome.relativePath);
      if ('reason' in outcome) {
        if (!listed) skipped.push(outcome);
      } else items.push(outcome);
      onProgress?.({ phase: 'reading', done: index + 1, total });
    }

    skipped.sort((a, b) => compareCodeUnits(a.relativePath, b.relativePath));
    const concepts = conceptsOf(items);
    const conceptRenames = await this.findConceptRenames(concepts);
    const counts = { new: 0, changed: 0, unchanged: 0, skipped: skipped.length };
    for (const item of items) counts[item.status] += 1;
    const fingerprint = await this.deps.hasher.hashText(
      JSON.stringify({ rootPath, items, skipped, conceptRenames }),
    );

    return { rootPath, fingerprint, items, concepts, skipped, conceptRenames, counts };
  }

  private async scan(rootPath: string): Promise<ScanResult> {
    try {
      return await this.deps.scanner.scan(rootPath, this.deps.layout.maxDepth);
    } catch (error) {
      throw new ImportSourceUnreadableError(rootPath, error);
    }
  }

  /** The file's image size and hash, or why it is skipped. */
  private async readFile(absolutePath: string): Promise<FileRead> {
    try {
      const info = await this.deps.inspector.inspect(absolutePath);
      if (!info) return { reason: 'not-an-image' };
      if (isTooLarge(info)) return { reason: 'image-too-large' };
      return { info, sha256: await this.deps.hasher.hashFile(absolutePath) };
    } catch (error) {
      return { reason: error instanceof ImageTooLargeError ? 'image-too-large' : 'unreadable' };
    }
  }

  private async describe(
    planned: PlannedDesign,
    read: Map<string, Promise<FileRead>>,
  ): Promise<ImportPreviewItem | SkippedFile> {
    const { relativePath, absolutePath } = planned.file;
    let reading = read.get(absolutePath);
    if (!reading) {
      reading = this.readFile(absolutePath);
      read.set(absolutePath, reading);
    }
    const file = await reading;
    if ('reason' in file) return { relativePath, reason: file.reason };
    const { info, sha256 } = file;

    const existing = await this.deps.designs.findByKey(planned.designKey);
    // A design upscaled or turned since keeps the hash of the file it was made from.
    const imported = existing && importedSha256(existing);
    const status: ImportItemStatus = !existing
      ? 'new'
      : imported === sha256
        ? 'unchanged'
        : 'changed';

    return {
      designKey: planned.designKey,
      conceptKey: planned.conceptKey,
      conceptName: planned.conceptName,
      familyId: planned.family.id,
      relativePath,
      absolutePath,
      byteSize: planned.file.byteSize,
      mimeType: info.mimeType,
      width: info.width,
      height: info.height,
      sha256,
      status,
      currentRevision: existing?.revision ?? null,
      borrowed: planned.borrowed,
    };
  }

  private async findConceptRenames(concepts: readonly PreviewConcept[]): Promise<ConceptRename[]> {
    const renames: ConceptRename[] = [];
    for (const { conceptKey, name } of concepts) {
      if (name === null) continue;
      const existing = await this.deps.concepts.findByKey(conceptKey);
      if (existing && existing.name !== name) {
        renames.push({ conceptKey, from: existing.name, to: name });
      }
    }
    return renames;
  }
}

type FileRead =
  | { readonly info: ImageInfo; readonly sha256: string }
  | { readonly reason: SkippedFile['reason'] };

/** One entry per concept key, named after the first of its files that gives a name. */
function conceptsOf(items: readonly ImportPreviewItem[]): PreviewConcept[] {
  const names = new Map<string, string | null>();
  for (const item of items) {
    if (!names.get(item.conceptKey)) names.set(item.conceptKey, item.conceptName);
  }
  return [...names]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([conceptKey, name]) => ({ conceptKey, name }));
}

function isTooLarge({ width, height }: ImageInfo): boolean {
  return width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS;
}
