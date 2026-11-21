import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { inProcessWorker, png } from '@pod/adapter-fs/testing';
import type { ImportProgressDto } from '@pod/contracts';
import { ThumbnailCache } from '../../assets/thumbnail-cache.js';
import { serviceOptions } from '../../testing/service-options.js';
import { createServices, type ServiceOptions, type Services } from '../create-services.js';

/** What each test of the wired services works with, set afresh before it. */
export interface ServicesContext {
  dir: string;
  designs: string;
  keywordFile: string | null;
  progress: ImportProgressDto[];
  catalogChanged: ReturnType<typeof vi.fn<() => void>>;
  services: Services;
}

export const ctx = {} as ServicesContext;

/** Options for the services in the test folder, in Turkish unless `language` says otherwise. */
export function options(language: 'en' | 'tr' = 'tr'): ServiceOptions {
  return serviceOptions(ctx.dir, inProcessWorker, {
    defaultSettings: { language },
    events: {
      importProgress: (event) => ctx.progress.push(event),
      catalogChanged: ctx.catalogChanged,
      batchChanged: () => undefined,
      upscaleProgress: () => undefined,
    },
    pickFolder: () => Promise.resolve(ctx.designs),
    pickKeywordFile: () => Promise.resolve(ctx.keywordFile),
    thumbnails: new ThumbnailCache(join(ctx.dir, 'thumbnails'), {
      render: () => Promise.resolve(png(10, 10)),
    }),
  });
}

/** Imports the designs folder, previewed first as the window does. */
export async function importDesigns() {
  const preview = await ctx.services.catalog.previewImport({ rootPath: ctx.designs });
  return ctx.services.catalog.runImport({
    rootPath: ctx.designs,
    fingerprint: preview.fingerprint,
  });
}

/** Fresh services over a folder of three designs, approved for import; closed after each test. */
export function useServices(): void {
  beforeEach(async () => {
    ctx.dir = mkdtempSync(join(tmpdir(), 'pod-app-'));
    ctx.designs = join(ctx.dir, 'designs');
    ctx.keywordFile = null;
    mkdirSync(join(ctx.designs, '01. Tasarım - Lantern Harbor'), { recursive: true });
    writeFileSync(join(ctx.designs, '01. Tasarım - Lantern Harbor', 'Kupa.png'), png(120, 50, 10));
    writeFileSync(join(ctx.designs, '01. Tasarım - Lantern Harbor', 'Battaniye.png'), png(80, 96));
    writeFileSync(join(ctx.designs, '02-mug.png'), png(120, 50, 200));
    ctx.progress = [];
    ctx.catalogChanged = vi.fn<() => void>();
    ctx.services = await createServices(options());
    await ctx.services.folders.choose();
  });

  afterEach(async () => {
    await ctx.services.close();
    rmSync(ctx.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
}
