import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { inProcessWorker } from '@pod/adapter-fs/testing';
import { SqliteDatabase } from '@pod/adapter-sqlite';
import type { UiLanguage } from '@pod/contracts';
import type { Design, ImageAsset } from '@pod/core';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import { SettingsStore } from '../../application/settings/settings-store.js';
import { serviceOptions } from '../../testing/service-options.js';
import { AI_DEFAULTS } from '../ai/ai-catalog.js';
import { prepareSharedParts, type ServiceOptions, type SharedParts } from '../shared-parts.js';

/** The test folder and its open database, set afresh before each test. */
export interface PartsFolder {
  dir: string;
  database: SqliteDatabase;
}

/** A fresh folder with a database for each test, closed and removed after it. */
export function usePartsFolder(): PartsFolder {
  const folder = {} as PartsFolder;
  beforeEach(() => {
    folder.dir = mkdtempSync(join(tmpdir(), 'pod-parts-'));
    folder.database = SqliteDatabase.open(join(folder.dir, 'catalog.db'));
  });
  afterEach(async () => {
    await folder.database.close();
    rmSync(folder.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return folder;
}

/** The shared parts over the folder, with nothing outside the test reached. */
export function partsIn(
  folder: PartsFolder,
  overrides: Partial<ServiceOptions> = {},
): Promise<SharedParts> {
  const options = serviceOptions(folder.dir, inProcessWorker, overrides);
  // Made by createServices in the app, which these tests go around.
  mkdirSync(options.dataDirectory, { recursive: true });
  return prepareSharedParts(options, folder.database);
}

/** Settings at their defaults, shown in `language`. */
export function settingsOf(
  parts: Pick<SharedParts, 'preferences'>,
  language: UiLanguage,
): SettingsStore {
  return new SettingsStore(parts.preferences, {
    language,
    ...AI_DEFAULTS,
    productFacts: {},
    listingSizes: {},
  });
}

/** Stores `bytes` as a PNG asset of the given size. */
export async function storedPng(
  parts: Pick<SharedParts, 'options' | 'assets'>,
  bytes: Uint8Array,
  size: { width: number; height: number },
): Promise<ImageAsset> {
  const file = join(parts.options.dataDirectory, `incoming-${String(bytes.length)}.png`);
  writeFileSync(file, bytes);
  const stored = await parts.assets.put(file, 'image/png');
  return { ...stored, mimeType: 'image/png', ...size };
}

/** Saves the design with its concept, e.g. `01-mug`. */
export async function savedDesign(
  parts: Pick<SharedParts, 'catalog'>,
  designKey: string,
  overrides: Partial<Omit<Design, 'designKey'>> = {},
): Promise<Design> {
  await parts.catalog.concepts.save(sampleConcept(designKey.slice(0, 2)));
  const design = sampleDesign(designKey, overrides);
  await parts.catalog.designs.save(design);
  return design;
}
