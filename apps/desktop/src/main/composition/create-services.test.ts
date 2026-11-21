import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServices } from './create-services.js';
import { ctx, importDesigns, options, useServices } from './testing/services-setup.js';

describe('createServices with real adapters', () => {
  useServices();

  it('imports an approved folder into the catalog and serves the stored files', async () => {
    const result = await importDesigns();

    expect(result.created).toEqual(['01-blanket', '01-mug', '02-mug']);
    expect(ctx.catalogChanged).toHaveBeenCalledTimes(1);
    const page = await ctx.services.catalog.listDesigns({ search: 'lantern' });
    expect(page.items.map((item) => [item.designKey, item.asset.width])).toEqual([
      ['01-blanket', 80],
      ['01-mug', 120],
    ]);
    const stored = ctx.services.assetPath(page.items[0]?.asset.storageKey ?? '');
    expect(stored.startsWith(join(ctx.dir, 'data', 'assets'))).toBe(true);
    expect(() => ctx.services.assetPath('../outside.png')).toThrow();
    expect(await ctx.services.assetKeys()).toContain(page.items[0]?.asset.storageKey);
    expect(ctx.progress.some((event) => event.phase === 'copying')).toBe(true);
    expect(await ctx.services.settings.get()).toMatchObject({
      language: 'tr',
      textProvider: 'anthropic',
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
      sceneProvider: 'gemini',
      sceneModel: 'gemini-nano-banana-2.1',
      productFacts: { mug: { care: 'Dishwasher and microwave safe' } },
    });
  });

  it('asks for the Printful connection before checking a print', async () => {
    await importDesigns();
    const [mug] = (await ctx.services.catalog.listDesigns({ familyId: 'mug' })).items;

    await expect(
      ctx.services.catalog.checkPrint({ designId: mug?.id ?? '', fit: 'contain' }),
    ).rejects.toMatchObject({ code: 'PRINTFUL_NOT_CONNECTED' });
    expect(await ctx.services.catalog.listMockups({ id: mug?.id ?? '' })).toEqual([]);
    expect(await ctx.services.connections.get()).toEqual({
      printful: null,
      fileHost: null,
      etsy: null,
      ai: { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false },
      pinterest: null,
    });
  });

  it('asks for the Etsy connection before reading the shop and has no listings yet', async () => {
    await importDesigns();
    const [mug] = (await ctx.services.catalog.listDesigns({ familyId: 'mug' })).items;
    const id = mug?.id ?? '';

    await expect(ctx.services.catalog.getShopOptions()).rejects.toMatchObject({
      code: 'ETSY_NOT_CONNECTED',
    });
    expect(await ctx.services.catalog.getListing({ id })).toBeNull();
    await expect(ctx.services.catalog.linkListing({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(ctx.services.catalog.refreshListing({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      ctx.services.text.writeListingText({ designId: id, language: 'en-US' }),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONNECTED', details: { service: 'Claude' } });
    await expect(
      ctx.services.text.translateListingText({
        title: 'T',
        description: 'D',
        tags: [],
        languages: [],
      }),
    ).resolves.toEqual({ translations: [], failed: [] });
    await expect(ctx.services.publishing.publishListing({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      ctx.services.catalog.createListing({
        designId: id,
        fit: 'contain',
        language: 'en-US',
        title: 'Mug',
        description: 'Nice',
        tags: [],
        price: 1999,
        currency: 'USD',
        variantIds: ['1320'],
        mockupIds: ['m1'],
        shippingProfileId: '316',
        readinessStateId: '151',
        productionPartnerIds: [],
      }),
    ).rejects.toMatchObject({ code: 'PRINTFUL_NOT_CONNECTED' });
  });

  it('writes listing text with the key and model of the chosen service', async () => {
    await ctx.services.close();
    const sent: string[] = [];
    const contents: unknown[] = [];
    const answer = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    const fakeFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      sent.push(`${request.method} ${request.url.split('?')[0] ?? ''}`);
      if (request.url.includes('api.anthropic.com/v1/models')) {
        return answer({ data: [], has_more: false, first_id: null, last_id: null });
      }
      if (request.url.includes('generativelanguage')) return answer({ models: [] });
      if (request.url.includes('api.openai.com/v1/models')) return answer({ data: [] });
      if (request.url.includes('api.openai.com')) {
        return answer({
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({ title: 'GPT Mug', description: 'D.', tags: [] }),
              },
            },
          ],
        });
      }
      const body = JSON.parse(await request.text()) as {
        model: string;
        messages: { content: unknown }[];
      };
      const model = body.model;
      contents.push(body.messages[0]?.content);
      return answer({
        id: 'msg',
        type: 'message',
        role: 'assistant',
        model,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ title: 'Tulip Mug', description: 'D.', tags: [] }),
          },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    };
    ctx.services = await createServices({ ...options(), fetch: fakeFetch });
    await ctx.services.folders.choose();
    await importDesigns();
    const [mug] = (await ctx.services.catalog.listDesigns({ familyId: 'mug' })).items;

    await ctx.services.connections.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    await ctx.services.connections.connectAi({ provider: 'gemini', apiKey: 'gk' });
    await ctx.services.settings.update({ textModel: 'claude-haiku-5-5' });
    const text = await ctx.services.text.writeListingText({
      designId: mug?.id ?? '',
      language: 'en',
    });

    expect(text.title).toBe('Tulip Mug');
    // The print goes first, and the missing tags are asked for once more.
    expect(contents[0]).toMatchObject([
      { type: 'image', source: { media_type: 'image/jpeg' } },
      { type: 'text' },
    ]);
    expect(contents[1]).toMatchObject([
      { type: 'text', text: expect.stringContaining('Only 0 tags are usable') as string },
    ]);
    expect(sent).toContain('POST https://api.anthropic.com/v1/messages');
    expect((await ctx.services.connections.get()).ai.gemini).toBe(true);
    expect(ctx.services.aiCatalog.openai.service).toBe('ChatGPT');

    // A service chosen in the settings writes the next text, with its own key.
    await ctx.services.settings.update({ textProvider: 'openai' });
    await expect(
      ctx.services.text.writeListingText({ designId: mug?.id ?? '', language: 'en' }),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONNECTED', details: { service: 'ChatGPT' } });
    await ctx.services.connections.connectAi({ provider: 'openai', apiKey: 'sk-openai' });
    const written = ctx.services.text.writeListingText({ designId: mug?.id ?? '', language: 'en' });
    await expect(written).resolves.toMatchObject({ title: 'GPT Mug' });
    expect(sent).toContain('POST https://api.openai.com/v1/chat/completions');
    await expect(
      ctx.services.scenes.createScene({
        designId: mug?.id ?? '',
        mockupId: 'gone',
        prompt: 'table',
        candidates: 1,
        look: { shape: '4:3' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
