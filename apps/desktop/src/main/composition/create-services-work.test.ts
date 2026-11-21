import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { SqliteDatabase } from '@pod/adapter-sqlite';
import type { BatchRequest } from '@pod/contracts';
import { createServices } from './create-services.js';
import { ctx, importDesigns, options, useServices } from './testing/services-setup.js';

describe('createServices keeping work across restarts', () => {
  useServices();

  it('researches Etsy, keeps the run and lists it', async () => {
    const run = await ctx.services.catalog.researchKeywords({ query: 'tulip mug' });

    expect(run.report.terms.map((term) => term.term)).toContain('tulip mug');
    expect(await ctx.services.catalog.getResearch({ id: run.id })).toEqual(run);
    expect((await ctx.services.catalog.listResearch()).map((summary) => summary.query)).toEqual([
      'tulip mug',
    ]);
    await expect(ctx.services.catalog.getResearch({ id: 'gone' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('imports a keyword file the seller picks, and refuses one too large to be a list', async () => {
    expect(await ctx.services.keywords.importKeywordList({})).toBeNull();

    ctx.keywordFile = join(ctx.dir, 'erank-tulip.csv');
    writeFileSync(ctx.keywordFile, '\uFEFFKeyword;Avg. Searches\n"tulip mug";"1.200"\n');
    const list = await ctx.services.keywords.importKeywordList({ market: 'DE' });

    expect(list).toMatchObject({
      fileName: 'erank-tulip.csv',
      market: 'DE',
      figures: ['searches'],
      keywords: [{ term: 'tulip mug', searches: 1200 }],
    });
    expect(await ctx.services.keywords.getKeywordList({ id: list?.id ?? '' })).toEqual(list);
    expect(await ctx.services.keywords.listKeywordLists()).toEqual([
      {
        id: list?.id,
        fileName: 'erank-tulip.csv',
        market: 'DE',
        importedAt: list?.importedAt,
        keywordCount: 1,
      },
    ]);
    await expect(ctx.services.keywords.getKeywordList({ id: 'gone' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    writeFileSync(ctx.keywordFile, `keyword\n${'tulip mug\n'.repeat(250_000)}`);
    await expect(ctx.services.keywords.importKeywordList({})).rejects.toMatchObject({
      code: 'KEYWORD_FILE_UNREADABLE',
      details: { reason: 'tooLarge' },
    });
    expect(await ctx.services.keywords.listKeywordLists()).toHaveLength(1);
    expect(await ctx.services.keywords.removeKeywordList({ id: list?.id ?? '' })).toEqual([]);
  });

  it('plans pins only from the design’s photos and runs the schedule until closed', async () => {
    await importDesigns();
    const [mug] = (await ctx.services.catalog.listDesigns({ familyId: 'mug' })).items;
    const id = mug?.id ?? '';
    const publishAt = new Date(Date.now() + 86_400_000).toISOString();

    ctx.services.startSchedules();
    expect(await ctx.services.catalog.listPins({ id })).toEqual([]);
    await expect(ctx.services.catalog.listBoards()).rejects.toMatchObject({
      code: 'PINTEREST_NOT_CONNECTED',
    });
    await expect(
      ctx.services.pins.planPin({
        designId: id,
        mockupId: 'm1',
        title: 'Tulip mug',
        description: '',
        altText: '',
        headline: '',
        boardId: '11',
        publishAt,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      ctx.services.catalog.proposePin({
        designId: id,
        mockupId: 'm1',
        title: 'Tulip mug',
        description: '',
        altText: '',
        headline: '',
        boardId: '11',
        publishAt,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets work under way finish when closing and refuses new work', async () => {
    const preview = await ctx.services.catalog.previewImport({ rootPath: ctx.designs });
    const importing = ctx.services.catalog.runImport({
      rootPath: ctx.designs,
      fingerprint: preview.fingerprint,
    });
    await ctx.services.close();

    expect((await importing).created).toHaveLength(3);
    // Reads have no queue to refuse them; the closed database does.
    await expect(ctx.services.catalog.listResearch()).rejects.toThrow('database is not open');
    await expect(
      ctx.services.catalog.previewImport({ rootPath: ctx.designs }),
    ).rejects.toMatchObject({
      code: 'APP_CLOSING',
    });
    ctx.services = await createServices(options());
  });

  it('prepares listings in the background and keeps the job across restarts', async () => {
    await importDesigns();
    const request: BatchRequest = {
      selection: { kind: 'filter', familyId: 'mug' },
      steps: ['print'],
      market: 'US',
    };

    expect(await ctx.services.batch.estimateBatch(request)).toMatchObject({
      designs: 2,
      printChecks: 2,
    });
    await ctx.services.batch.startBatch(request);
    await vi.waitFor(async () => {
      expect((await ctx.services.catalog.getBatchStatus()).job?.state).toBe('finished');
    });
    const { job } = await ctx.services.catalog.getBatchStatus();
    expect(job?.failures.map((failure) => [failure.designKey, failure.error.code])).toEqual([
      ['01-mug', 'PRINTFUL_NOT_CONNECTED'],
      ['02-mug', 'PRINTFUL_NOT_CONNECTED'],
    ]);

    await ctx.services.close();
    ctx.services = await createServices(options());
    expect((await ctx.services.catalog.getBatchStatus()).job).toMatchObject({
      state: 'finished',
      failures: [{}, {}],
    });
  });

  it('starts without a job when the stored one cannot be read', async () => {
    await ctx.services.close();
    const database = new DatabaseSync(join(ctx.dir, 'data', 'catalog.db'));
    database.exec(
      `INSERT INTO batch_jobs (id, state, steps_json, market, created_at)
       VALUES ('j1', 'running', '["print"]', 'XX', 'not a date')`,
    );
    database.close();
    const logError = vi.fn();

    ctx.services = await createServices({ ...options(), logError });

    expect(logError).toHaveBeenCalledWith(expect.any(Error));
    expect(await ctx.services.catalog.getBatchStatus()).toEqual({ job: null });
  });

  it('says so when the upscaling engine is not installed', async () => {
    await importDesigns();
    const [blanket] = (await ctx.services.catalog.listDesigns({ familyId: 'blanket' })).items;

    await expect(
      ctx.services.upscale.upscaleDesign({ id: blanket?.id ?? '' }),
    ).rejects.toMatchObject({
      code: 'UPSCALER_UNAVAILABLE',
    });
  });

  it('refuses folders the user has not approved', async () => {
    mkdirSync(join(ctx.dir, 'other'));

    await expect(
      ctx.services.catalog.previewImport({ rootPath: join(ctx.dir, 'other') }),
    ).rejects.toMatchObject({ code: 'IMPORT_FOLDER_NOT_APPROVED' });
  });

  it('keeps the catalog and approved folders after the app restarts', async () => {
    await importDesigns();
    await ctx.services.close();
    const orphan = join(ctx.dir, 'data', 'assets', 'ab', `${'ab'.repeat(32)}.png`);
    mkdirSync(join(ctx.dir, 'data', 'assets', 'ab'), { recursive: true });
    writeFileSync(orphan, 'left by a failed mockup run');

    ctx.services = await createServices(options('en'));

    expect(existsSync(orphan)).toBe(false);
    const [first] = (await ctx.services.catalog.listDesigns({})).items;
    expect(existsSync(ctx.services.assetPath(first?.asset.storageKey ?? ''))).toBe(true);

    expect((await ctx.services.catalog.listDesigns({})).total).toBe(3);
    expect(await ctx.services.catalog.listImportFolders()).toHaveLength(1);
    const again = await ctx.services.catalog.previewImport({ rootPath: ctx.designs });
    expect(again.counts).toEqual({ new: 0, changed: 0, unchanged: 3, skipped: 0 });
  });

  it('closes the database when a later start-up step fails', async () => {
    await ctx.services.close();
    const assets = join(ctx.dir, 'data', 'assets');
    rmSync(assets, { recursive: true, force: true });
    writeFileSync(assets, 'not a folder');

    const close = vi.spyOn(SqliteDatabase.prototype, 'close');

    await expect(createServices(options())).rejects.toMatchObject({
      path: expect.stringContaining('assets') as string,
    });
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
    rmSync(join(ctx.dir, 'data', 'catalog.db'));
    ctx.services = await createServices({ ...options(), dataDirectory: join(ctx.dir, 'fresh') });
  });
});
