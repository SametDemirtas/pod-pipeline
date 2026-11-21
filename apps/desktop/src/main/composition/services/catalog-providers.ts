import { NodeHasher, NodeSourceScanner } from '@pod/adapter-fs';
import {
  ConceptFolderLayout,
  DEFAULT_PRODUCT_FAMILIES,
  GetDesign,
  ListDesigns,
  PreviewImport,
  ProductFamilyCatalog,
  RunImport,
} from '@pod/core';
import { CatalogService } from '../../application/catalog/catalog-service.js';
import type { ImportFolderPolicy } from '../../application/catalog/import-folder-policy.js';
import { SettingsPorts } from '../../application/settings/settings-ports.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { RealFolderScanner } from '../../files/real-folder-scanner.js';
import type { SharedParts } from '../shared-parts.js';

/** The catalog of designs and importing them from the seller's folders. */
export function createCatalogService(
  parts: Pick<SharedParts, 'catalog' | 'inspector' | 'assets' | 'clock' | 'ids' | 'options'>,
  folders: ImportFolderPolicy,
  settings: SettingsStore,
): CatalogService {
  const { catalog } = parts;
  const families = new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES);
  const previewImport = new PreviewImport({
    scanner: new RealFolderScanner(new NodeSourceScanner()),
    layout: new ConceptFolderLayout(families),
    inspector: parts.inspector,
    hasher: new NodeHasher(),
    designs: catalog.designs,
    concepts: catalog.concepts,
    artwork: new SettingsPorts(settings),
  });
  return new CatalogService({
    families,
    listDesigns: new ListDesigns(catalog.query, families),
    getDesign: new GetDesign(catalog.query),
    previewImport,
    runImport: new RunImport({
      planner: previewImport,
      assets: parts.assets,
      unitOfWork: catalog,
      clock: parts.clock,
      ids: parts.ids,
    }),
    folders,
    events: parts.options.events,
  });
}
