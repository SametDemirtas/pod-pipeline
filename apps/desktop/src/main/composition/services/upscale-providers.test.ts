import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inProcessWorker, pixelsOf, png } from '@pod/adapter-fs/testing';
import { SqliteDatabase } from '@pod/adapter-sqlite';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import { WorkStoppedError } from '../../application/errors/work-stopped.js';
import { SettingsStore } from '../../application/settings/settings-store.js';
import { printCheckDto } from '../../testing/batch-fixtures.js';
import { serviceOptions } from '../../testing/service-options.js';
import { AI_DEFAULTS } from '../ai/ai-catalog.js';
import { prepareSharedParts } from '../shared-parts.js';
import { createUpscaleService, type UpscaleEngine } from './upscale-providers.js';

/** A Node script stands in for the engine, so the test runs the same on every system. */
const scriptEngine: UpscaleEngine = {
  fileName: 'engine.mjs',
  start: (command, args) =>
    spawn(process.execPath, [command, ...args], { stdio: ['ignore', 'ignore', 'pipe'] }),
};

/** Copies `source` to the file the engine is told to write, as the real one writes its result. */
const copyTo = (source: string, progress = '') =>
  [
    "import { copyFileSync } from 'node:fs';",
    "const out = process.argv[process.argv.indexOf('-o') + 1];",
    progress && `process.stderr.write(${JSON.stringify(progress)});`,
    `copyFileSync(${JSON.stringify(source)}, out);`,
  ].join('\n');

describe('createUpscaleService', () => {
  let dir: string;
  let database: SqliteDatabase;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-upscale-'));
    database = SqliteDatabase.open(join(dir, 'catalog.db'));
  });

  afterEach(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  function engine(script: string): void {
    const folder = join(dir, 'upscaler');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, scriptEngine.fileName), script);
  }

  async function service(upscaleEngine = scriptEngine) {
    const parts = await prepareSharedParts(serviceOptions(dir, inProcessWorker), database);
    const artwork = join(dir, 'art.png');
    writeFileSync(artwork, png(80, 96, 120));
    const stored = await parts.assets.put(artwork, 'image/png');
    await parts.catalog.concepts.save(sampleConcept('01'));
    const design = sampleDesign('01-blanket', {
      asset: { ...stored, mimeType: 'image/png', width: 80, height: 96 },
    });
    await parts.catalog.designs.save(design);
    const settings = new SettingsStore(parts.preferences, {
      language: 'en',
      ...AI_DEFAULTS,
      productFacts: {},
      listingSizes: {},
    });
    const area = [{ placement: 'default', width: 160, height: 192, dpi: 150 }];
    const checkPrint = () =>
      Promise.resolve(
        printCheckDto({
          fit: 'cover',
          variants: [{ id: '1', name: 'Blanket', color: null, size: null, areas: area }],
          variantId: '1',
        }),
      );
    const upscale = createUpscaleService(parts, settings, { checkPrint }, upscaleEngine);
    return { upscale, design, parts };
  }

  it('keeps what the engine wrote, scaled to the listed size, as the next revision', async () => {
    writeFileSync(join(dir, 'larger.png'), png(320, 384, 200));
    engine(copyTo(join(dir, 'larger.png'), '50.00%\n'));
    const { upscale, design, parts } = await service();

    const larger = await upscale.upscaleDesign({ id: design.id });

    expect(larger).toMatchObject({ revision: 2, upscaleModel: 'illustration' });
    expect(larger.asset).toMatchObject({ width: 160, height: 192 });
    const file = pixelsOf(await readFile(parts.assets.pathOf(larger.asset.storageKey)));
    expect(file).toMatchObject({ width: 160, height: 192 });
    expect(file.data[0]).toBe(200);
    await upscale.close();
  });

  it('passes the engine failure on, without its progress lines', async () => {
    engine("process.stderr.write('12.50%\\nvkCreateInstance failed\\n');\nprocess.exitCode = 1;");
    const { upscale, design } = await service();

    await expect(upscale.upscaleDesign({ id: design.id })).rejects.toMatchObject({
      code: 'UPSCALE_FAILED',
      details: { reason: 'vkCreateInstance failed' },
    });
    await upscale.close();
  });

  it('reports an engine stopped by a cancelled job as stopped, not as the app closing', async () => {
    engine("process.stderr.write('0.00%\\n');\nsetTimeout(() => undefined, 30_000);");
    const controller = new AbortController();
    // Cancelled once the engine reports progress, so it is surely running by then.
    const { upscale, design } = await service({
      ...scriptEngine,
      start: (command, args) => {
        const child = scriptEngine.start(command, args);
        child.stderr?.once('data', () => {
          controller.abort();
        });
        return child;
      },
    });

    const running = upscale.upscaleDesign({ id: design.id }, controller.signal);

    await expect(running).rejects.toBeInstanceOf(WorkStoppedError);
    await upscale.close();
  });

  it('refuses an image of the wrong size', async () => {
    writeFileSync(join(dir, 'larger.png'), png(300, 384, 200));
    engine(copyTo(join(dir, 'larger.png')));
    const { upscale, design } = await service();

    await expect(upscale.upscaleDesign({ id: design.id })).rejects.toMatchObject({
      code: 'UPSCALE_FAILED',
      details: { reason: 'wrote 300 × 384 pixels, not 320 × 384' },
    });
    await upscale.close();
  });
});
