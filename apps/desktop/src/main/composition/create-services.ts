import { mkdir, realpath } from 'node:fs/promises';
import { SqliteDatabase } from '@pod/adapter-sqlite';
import { DEFAULT_LISTING_SIZES, DEFAULT_PRODUCT_FACTS } from '@pod/core';
import type { CatalogApi } from '@pod/contracts';
import type { WindowServices } from '../api/desktop-operations.js';
import type { CatalogService } from '../application/catalog/catalog-service.js';
import { ImportFolderPolicy } from '../application/catalog/import-folder-policy.js';
import { ImportFolderService } from '../application/catalog/import-folder-service.js';
import { ConnectionsService } from '../application/connections/connections-service.js';
import type { ListingService } from '../application/listing/listing-service.js';
import type { TextService } from '../application/listing/text-service.js';
import { PinScheduler } from '../application/pins/pin-scheduler.js';
import type { PinService } from '../application/pins/pin-service.js';
import type { PrintService } from '../application/print/print-service.js';
import type { ResearchService } from '../application/research/research-service.js';
import { SettingsStore } from '../application/settings/settings-store.js';
import { closeAllThen } from '../shared/wait-at-most.js';
import { AI_DEFAULTS, aiCatalog } from './ai/ai-catalog.js';
import { closingWork } from './closing-work.js';
import { createConnectionChecks } from './connection-checks.js';
import { systemTimers } from './system-timers.js';
import { dataPath } from '../files/data-folder.js';
import { createBatchService } from './services/batch-providers.js';
import { createCatalogService } from './services/catalog-providers.js';
import { createKeywordListService } from './services/keyword-providers.js';
import { createListingService } from './services/listing-providers.js';
import { createPinServiceFor } from './services/pin-providers.js';
import { createPrintService } from './services/print-providers.js';
import { createResearchService } from './services/research-providers.js';
import { createRotationService } from './services/rotation-providers.js';
import { createPhotoService, createSceneService } from './services/scene-providers.js';
import { createTextService } from './services/text-providers.js';
import { createUpscaleService } from './services/upscale-providers.js';
import { prepareSharedParts, type ServiceOptions, type SharedParts } from './shared-parts.js';

export type { ServiceOptions } from './shared-parts.js';

export interface Services extends WindowServices {
  /** Absolute path of a stored asset; throws for keys the store did not produce. */
  readonly assetPath: (storageKey: string) => string;
  /** Storage keys of every stored asset, after unused ones were removed at start. */
  readonly assetKeys: () => Promise<readonly string[]>;
  /** Starts publishing due pins, at once and then every minute. */
  readonly startSchedules: () => void;
  readonly close: () => Promise<void>;
}

/** Composition root of the application: the only place that picks adapters for ports. */
export async function createServices(options: ServiceOptions): Promise<Services> {
  await mkdir(options.dataDirectory, { recursive: true });
  const database = SqliteDatabase.open(dataPath(options.dataDirectory, 'database'));
  try {
    return await assemble(options, database);
  } catch (error) {
    await database.close();
    throw error;
  }
}

function createSettings(parts: Pick<SharedParts, 'preferences' | 'options'>): SettingsStore {
  return new SettingsStore(parts.preferences, {
    ...parts.options.defaultSettings,
    ...AI_DEFAULTS,
    productFacts: DEFAULT_PRODUCT_FACTS,
    listingSizes: DEFAULT_LISTING_SIZES,
  });
}

function createConnections(
  parts: Pick<SharedParts, 'secrets' | 'fetch' | 'clock' | 'ids' | 'options'>,
): ConnectionsService {
  return new ConnectionsService({
    secrets: parts.secrets,
    checks: createConnectionChecks(parts.fetch, parts.clock, parts.ids),
    openExternal: parts.options.openExternal,
    clock: parts.clock,
  });
}

async function assemble(options: ServiceOptions, database: SqliteDatabase): Promise<Services> {
  const parts = await prepareSharedParts(options, database);
  const policy = new ImportFolderPolicy(parts.preferences, realpath);
  const folders = new ImportFolderService(policy, options.pickFolder);
  const settings = createSettings(parts);
  const catalog = createCatalogService(parts, policy, settings);
  const print = createPrintService(parts, settings);
  const connections = createConnections(parts);
  const listings = createListingService(parts, settings, connections);
  const research = createResearchService(parts);
  const scenes = createSceneService(parts, settings);
  const photos = createPhotoService(parts);
  const pins = createPinServiceFor(parts);
  const scheduler = new PinScheduler({
    publishDue: () => pins.publishDue(),
    logError: options.logError,
    timers: systemTimers,
  });
  const text = createTextService(parts, settings);
  const operations = combine(catalog, print, listings, research, pins, folders);
  const { upscale, rotation, keywords, aiServices, batch } = await createPreparing(
    parts,
    settings,
    operations,
    text,
  );

  return {
    catalog: { ...operations, getBatchStatus: () => batch.getBatchStatus() },
    publishing: listings,
    connections,
    settings,
    aiCatalog: aiServices,
    text,
    scenes,
    photos,
    batch,
    pins,
    print,
    upscale,
    rotation,
    keywords,
    folders,
    assetPath: (storageKey) => parts.assets.pathOf(storageKey),
    assetKeys: () => parts.assets.listKeys(),
    startSchedules: () => {
      // Queued before the first scheduled run, so an interrupted pin is never sent again.
      pins.recoverInterrupted().catch(options.logError);
      scheduler.start();
    },
    close: () => {
      const scheduled = { close: () => scheduler.stop() };
      const parts = { batch, pins, catalog, print, listings, research, scenes, upscale, rotation };
      const work = closingWork({ ...parts, scheduler: scheduled, connections });
      return closeAllThen(work, database, options.logError, systemTimers);
    },
  };
}

/**
 * The services that prepare listings over the client operations, with the
 * batch job of the last run recovered.
 */
async function createPreparing(
  parts: Parameters<typeof createUpscaleService>[0] &
    Parameters<typeof createRotationService>[0] &
    Parameters<typeof createKeywordListService>[0] &
    Parameters<typeof createBatchService>[0],
  settings: SettingsStore,
  operations: Omit<CatalogApi, 'getBatchStatus'>,
  text: TextService,
) {
  const upscale = createUpscaleService(parts, settings, operations);
  const rotation = createRotationService(parts, settings, operations);
  const aiServices = aiCatalog();
  const keywords = createKeywordListService(parts);
  const batch = createBatchService(parts, {
    catalog: operations,
    text,
    upscale,
    rotation,
    keywordLists: keywords,
    settings,
    aiCatalog: aiServices,
  });
  // A job that cannot be read must not keep the app from starting; the next run replaces it.
  await batch.recover().catch(parts.options.logError);
  return { upscale, rotation, keywords, aiServices, batch };
}

/** Every client operation but the batch's. */
function combine(
  catalog: CatalogService,
  print: PrintService,
  listings: ListingService,
  research: ResearchService,
  pins: PinService,
  folders: ImportFolderService,
): Omit<CatalogApi, 'getBatchStatus'> {
  return {
    listFamilies: () => catalog.listFamilies(),
    listDesigns: (request) => catalog.listDesigns(request),
    getDesign: (request) => catalog.getDesign(request),
    previewImport: (request) => catalog.previewImport(request),
    runImport: (request) => catalog.runImport(request),
    listImportFolders: () => folders.list(),
    checkPrint: (request) => print.checkPrint(request),
    createMockups: (request) => print.createMockups(request),
    listMockups: (request) => print.listMockups(request),
    getShopOptions: () => listings.getShopOptions(),
    getListing: (request) => listings.getListing(request),
    createListing: (request) => listings.createListing(request),
    linkListing: (request) => listings.linkListing(request),
    refreshListing: (request) => listings.refreshListing(request),
    listingPhotos: (request) => listings.listingPhotos(request),
    replaceListingPhotos: (request) => listings.replaceListingPhotos(request),
    researchKeywords: (request) => research.researchKeywords(request),
    listResearch: () => research.listResearch(),
    getResearch: (request) => research.getResearch(request),
    listBoards: () => pins.listBoards(),
    listPins: (request) => pins.listPins(request),
    proposePin: (request) => pins.proposePin(request),
  };
}
