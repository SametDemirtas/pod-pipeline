import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { LISTING_LIMITS } from '@pod/rules';
import { AppVersionMismatchError } from '../connection.js';
import { PROGRESS_INTERVAL_MS } from '../progress.js';
import { connect, fakeApi, text } from '../testing/fake-catalog-api.js';

describe('app tools', () => {
  it('lists the tools with hints for what they change and whom they reach', async () => {
    const { tools } = await (await connect(fakeApi())).listTools();

    expect(
      tools.map((tool) => [
        tool.name,
        tool.annotations?.readOnlyHint,
        tool.annotations?.idempotentHint,
        tool.annotations?.openWorldHint,
        tool.outputSchema !== undefined,
      ]),
    ).toEqual([
      ['list_product_families', true, true, false, true],
      ['list_designs', true, true, false, true],
      ['get_design', true, true, false, true],
      ['list_import_folders', true, true, false, true],
      ['preview_import', true, true, false, true],
      ['run_import', false, true, false, true],
      ['check_print', true, true, true, true],
      ['create_mockups', false, false, true, true],
      ['list_mockups', true, true, false, true],
      ['get_shop_options', true, true, true, true],
      ['get_listing', true, true, false, true],
      ['refresh_listing', false, true, true, true],
      ['get_listing_photos', true, true, true, true],
      ['create_etsy_draft', false, false, true, true],
      ['link_printful', false, true, true, true],
      ['replace_etsy_draft_photos', false, true, true, true],
      ['research_etsy', false, false, true, true],
      ['list_research', true, true, false, true],
      ['get_research', true, true, false, true],
      ['list_pinterest_boards', true, true, true, true],
      ['list_pins', true, true, false, true],
      ['propose_pin', false, false, false, true],
      ['get_batch_status', true, true, false, true],
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain('publish_listing');
    expect(tools.map((tool) => tool.name)).not.toContain('publish_pin');
    for (const name of [
      'start_batch',
      'cancel_batch',
      'retry_batch',
      'write_listing_text',
      'upscale_design',
    ]) {
      expect(tools.map((tool) => tool.name)).not.toContain(name);
    }
    const createMockups = tools.find((tool) => tool.name === 'create_mockups');
    expect(createMockups?.annotations?.destructiveHint).toBe(true);
    const checkPrint = tools.find((tool) => tool.name === 'check_print');
    expect(checkPrint?.description).toContain('Upscale 4× on the design page');
    const listDesigns = tools.find((tool) => tool.name === 'list_designs');
    expect(listDesigns?.description).toContain('nextCursor');
    const createDraft = tools.find((tool) => tool.name === 'create_etsy_draft');
    expect(createDraft?.description).toContain('only the productFacts from check_print');
    expect(createDraft?.description).toContain(
      `leave ${String(LISTING_LIMITS.aiNote)} characters free`,
    );
  });

  it('returns structured content with a compact JSON copy', async () => {
    const client = await connect(fakeApi());

    const families = await client.callTool({ name: 'list_product_families', arguments: {} });
    const folders = await client.callTool({ name: 'list_import_folders', arguments: {} });

    expect(families.structuredContent).toEqual({ families: [{ id: 'mug' }] });
    expect(text(families)).toBe('{"families":[{"id":"mug"}]}');
    expect(folders.structuredContent).toEqual({ folders: ['/Designs'] });
  });

  it('maps tool arguments to API requests', async () => {
    const api = fakeApi();
    const client = await connect(api);

    const page = await client.callTool({
      name: 'list_designs',
      arguments: { family_id: 'mug', search: ' tulip ', limit: 5, cursor: 'c1' },
    });
    const result = await client.callTool({
      name: 'run_import',
      arguments: { folder: '/Designs', fingerprint: 'f' },
    });

    expect(api.listDesigns).toHaveBeenCalledWith({
      familyId: 'mug',
      search: 'tulip',
      limit: 5,
      cursor: 'c1',
    });
    expect(page.structuredContent).toMatchObject({ nextCursor: 'c2', total: 30 });
    expect(api.runImport).toHaveBeenCalledWith({ rootPath: '/Designs', fingerprint: 'f' });
    expect(result.structuredContent).toMatchObject({ created: ['01-mug'] });
  });

  it.each([
    [
      'get_design',
      { design_id: 'x' },
      'NOT_FOUND: Design x was not found\n' +
        'Check the id against list_designs, list_mockups, list_research or list_pins; for a ' +
        'variant, call check_print without variant_id to see valid ones.',
    ],
    [
      'preview_import',
      { folder: '/d' },
      'POD Pipeline is not running. Open the app, then try again.',
    ],
  ])('reports %s failures as tool errors', async (name, args, message) => {
    const result = await (await connect(fakeApi())).callTool({ name, arguments: args });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(message);
  });

  it.each([
    ['IMPORT_IN_PROGRESS', /Wait until the running import finishes/],
    ['IMPORT_PLAN_CHANGED', /Call preview_import again/],
    ['IMPORT_FOLDER_NOT_APPROVED', /list_import_folders/],
    ['PRINTFUL_NOT_CONNECTED', /connect Printful in the app/],
    ['FILE_HOST_NOT_CONNECTED', /connect Dropbox or Cloudflare R2/],
    ['PINTEREST_NOT_CONNECTED', /connect Pinterest in the app/],
    ['PIN_IN_PROGRESS', /call list_pins/],
    ['RESEARCH_IN_PROGRESS', /call list_research/],
    ['RESEARCH_RATE_LIMITED', /details\.retryAfterSeconds/],
    ['RESEARCH_BLOCKED', /pass the check/],
    ['RESEARCH_CANCELLED', /closed the Etsy window/],
    ['RESEARCH_PAGE_CHANGED', /changed its search page/],
    ['INVALID_REQUEST', /paths in details\.issues .* snake_case/],
    ['VALIDATION', /details\.field .* snake_case/],
    ['DRAFT_LEFT_BEHIND', /details\.marketplaceId is still on Etsy.*I checked my drafts/],
    ['DRAFT_UNCONFIRMED', /delete it there, then choose "I checked my drafts" in the app/],
    ['DRAFTS_NOT_CHECKED', /"I checked my drafts" in the app; call create_etsy_draft again/],
    ['PROVIDER_FAILED', /Printful, Etsy, Pinterest or the file host/],
    ['PROVIDER_BUSY', /details\.retryAfterSeconds, or a minute/],
    ['PROVIDER_INTERRUPTED', /may have done the work and charged for it/],
    ['APP_CLOSING', /The app is closing/],
    ['OTHER_BRAND_NAMED', /details\.brands, a brand this product does not fit/],
    ['SHIPPING_PROFILE_GONE', /details\.familyId is no longer in the Etsy shop/],
  ] as const)('tells the assistant what to do after %s', async (code, nextStep) => {
    const api = fakeApi();
    api.runImport.mockRejectedValueOnce(
      new ApiError({ code, message: 'refused', details: { rootPath: '/d' } }),
    );

    const result = await (
      await connect(api)
    ).callTool({
      name: 'run_import',
      arguments: { folder: '/d', fingerprint: 'f' },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(nextStep);
    expect(text(result)).toContain('Details: {"rootPath":"/d"}');
  });

  it('reports version mismatches and unexpected errors plainly', async () => {
    const api = fakeApi();
    api.listFamilies.mockRejectedValueOnce(new AppVersionMismatchError(2));
    api.listImportFolders.mockRejectedValueOnce(new Error('disk exploded'));
    const client = await connect(api);

    const mismatch = await client.callTool({ name: 'list_product_families', arguments: {} });
    const unexpected = await client.callTool({ name: 'list_import_folders', arguments: {} });

    expect(text(mismatch)).toMatch(/local API version 2/);
    expect(text(unexpected)).toBe('The app could not complete the request.');
  });

  it.each([
    ['list_designs', { limit: 500 }],
    ['list_designs', { family_id: '' }],
    ['list_designs', { search: '🎄'.repeat(101) }],
    ['get_design', { design_id: '' }],
    ['preview_import', { folder: 'relative/path' }],
    ['run_import', { folder: '/d', fingerprint: '' }],
  ])('rejects %s arguments %j before calling the app', async (name, args) => {
    const api = fakeApi();

    const result = await (await connect(api)).callTool({ name, arguments: args });

    expect(result.isError).toBe(true);
    expect(api.listDesigns).not.toHaveBeenCalled();
    expect(api.getDesign).not.toHaveBeenCalled();
    expect(api.previewImport).not.toHaveBeenCalled();
    expect(api.runImport).not.toHaveBeenCalled();
  });
});

describe('long tools', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['preview_import', 'previewImport', { folder: '/Designs' }],
    ['run_import', 'runImport', { folder: '/Designs', fingerprint: 'f' }],
    ['link_printful', 'linkListing', { design_id: 'd1' }],
    ['replace_etsy_draft_photos', 'replaceListingPhotos', { design_id: 'd1', mockup_ids: ['m1'] }],
    ['research_etsy', 'researchKeywords', { query: 'tulip mug' }],
  ] as const)('%s reports progress while the app works', async (name, method, args) => {
    vi.useFakeTimers();
    const api = fakeApi();
    const original = api[method].getMockImplementation();
    let finish: () => void = () => undefined;
    api[method].mockImplementationOnce(
      (...call: never[]) =>
        new Promise((resolve) => {
          finish = () => {
            resolve((original as (...a: never[]) => unknown)(...call));
          };
        }) as never,
    );
    const client = await connect(api);
    const progress: unknown[] = [];

    const result = client.callTool({ name, arguments: args }, undefined, {
      onprogress: (update) => progress.push(update),
      timeout: 120_000,
    });
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS);
    finish();
    await result;

    expect(progress).toHaveLength(1);
  });
});
