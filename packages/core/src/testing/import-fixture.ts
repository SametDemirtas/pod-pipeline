import { DEFAULT_PRODUCT_FAMILIES } from '../catalog/default-families.js';
import { ProductFamilyCatalog } from '../catalog/product-family.js';
import { ConceptFolderLayout } from '../import/import-layout.js';
import type { ImportPlanner } from '../import/import-preview.js';
import { PreviewImport } from '../import/preview-import.js';
import { RunImport, type ImportResult } from '../import/run-import.js';
import type { UnitOfWork } from '../ports/catalog-repositories.js';
import {
  FakeSourceFolder,
  FixedClock,
  RecordingAssetStore,
  SequentialIds,
  type FakeFile,
} from './fakes.js';
import { InMemoryCatalog } from './in-memory-catalog.js';

export const IMPORT_ROOT = '/designs';

const SAMPLE_FILES: readonly FakeFile[] = [
  { relativePath: '01. Lantern Harbor/Kupa.png', content: 'tulip-mug' },
  { relativePath: '01. Lantern Harbor/Battaniye.png', content: 'tulip-blanket' },
  { relativePath: '02. Frost Garden/Mug.png', content: 'frost-mug' },
  { relativePath: 'readme.txt', content: 'hello' },
];

/** A folder, catalog and both import use cases wired together over fakes. */
export class ImportFixture {
  readonly folder = new FakeSourceFolder(IMPORT_ROOT, SAMPLE_FILES);
  readonly catalog = new InMemoryCatalog();
  readonly assets = new RecordingAssetStore(this.folder);
  readonly clock = new FixedClock();
  /** Whether Samsung cases are made from phone case files, as the seller's setting says. */
  shareArtwork = true;
  readonly preview = new PreviewImport({
    scanner: this.folder,
    layout: new ConceptFolderLayout(new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES)),
    inspector: this.folder,
    hasher: this.folder,
    designs: this.catalog.designs,
    concepts: this.catalog.concepts,
    artwork: { shared: () => Promise.resolve(this.shareArtwork) },
  });
  readonly runImport = this.createRunImport();

  createRunImport(options: { unitOfWork?: UnitOfWork; planner?: ImportPlanner } = {}): RunImport {
    return new RunImport({
      planner: options.planner ?? this.preview,
      assets: this.assets,
      unitOfWork: options.unitOfWork ?? this.catalog,
      clock: this.clock,
      ids: new SequentialIds(),
    });
  }

  async importAll(runImport: RunImport = this.runImport): Promise<ImportResult> {
    const plan = await this.preview.execute(IMPORT_ROOT);
    return runImport.execute({ rootPath: IMPORT_ROOT, fingerprint: plan.fingerprint });
  }

  async designKeys(): Promise<string[]> {
    const page = await this.catalog.listDesigns({}, { limit: 100 });
    return page.items.map((item) => item.designKey);
  }

  async revisionsOf(designKey: string): Promise<number[]> {
    const design = await this.catalog.designs.findByKey(designKey);
    const details = design ? await this.catalog.getDesign(design.id) : undefined;
    return details?.revisions.map((revision) => revision.revision) ?? [];
  }
}
