import { describe, expect, it } from 'vitest';
import type { ListingDto } from '@pod/contracts';
import { shopOptionsDto } from '../../../testing/batch-fixtures.js';
import { ProviderBusyError } from '../../errors/provider-errors.js';
import { PROVIDER_BUSY_RETRY_MS } from '../busy-waits.js';
import { PREPARED, written, item, setUp } from '../../../testing/batch-steps-setup.js';

describe('text step', () => {
  it('writes in the main language with the research words and translates into the others', async () => {
    const { text, run } = setUp();
    const keywords = [{ term: 'meadow bees mug', market: 'US' as const, suggested: true }];

    const outcome = await run('text', item({ keywords }));

    expect(text.writeListingText).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      language: 'en-US',
      variantIds: ['1320', '4830'],
      keywords,
    });
    expect(text.translateListingText).toHaveBeenCalledWith({
      title: 'Meadow Bees Mug',
      description: 'Meadow Bees Mug.',
      tags: ['fall mug'],
      languages: ['de', 'fr'],
      familyId: 'mug',
    });
    expect(outcome).toMatchObject({
      state: 'done',
      prepared: {
        text: {
          language: 'en-US',
          text: { title: 'Meadow Bees Mug' },
          translations: [{ language: 'de' }, { language: 'fr' }],
        },
      },
    });
  });

  it('waits for a busy text service instead of failing the design', async () => {
    const { text, wait, run } = setUp();
    text.writeListingText.mockRejectedValueOnce(new ProviderBusyError('Claude', 30));
    text.translateListingText.mockRejectedValueOnce(new ProviderBusyError('Claude'));

    expect(await run('text')).toMatchObject({ state: 'done' });
    expect(wait.mock.calls).toEqual([
      [30_000, expect.any(AbortSignal)],
      [PROVIDER_BUSY_RETRY_MS, expect.any(AbortSignal)],
    ]);
  });

  it('pays only for what is missing, and nothing for a design with a listing', async () => {
    const { catalog, text, run } = setUp();

    expect(await run('text', item({ text: PREPARED }))).toMatchObject({
      state: 'done',
      prepared: { text: { translations: [{ language: 'de' }, { language: 'fr' }] } },
    });
    expect(text.writeListingText).not.toHaveBeenCalled();
    expect(text.translateListingText).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ['fr'] }),
    );

    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ languages: ['en-US', 'de'] }));
    expect(await run('text', item({ text: PREPARED }))).toEqual({ state: 'skipped' });
    catalog.getListing.mockResolvedValue({} as ListingDto);
    expect(await run('text')).toEqual({ state: 'skipped' });
    expect(text.writeListingText).not.toHaveBeenCalled();
  });

  it('keeps the translations that came back and fails for the others', async () => {
    const { text, run } = setUp();
    text.translateListingText.mockResolvedValueOnce({
      translations: [{ language: 'de', ...written('[de]') }],
      failed: ['fr'],
    });

    const partly = await run('text');
    expect(partly).toMatchObject({
      state: 'failed',
      error: { code: 'TRANSLATION_INCOMPLETE', details: { languages: ['fr'] } },
      prepared: { text: { translations: [{ language: 'de' }] } },
    });

    text.translateListingText.mockRejectedValueOnce(new Error('all failed'));
    expect(await run('text')).toMatchObject({
      state: 'failed',
      prepared: { text: { text: { title: 'Meadow Bees Mug' }, translations: [] } },
    });
  });

  it('writes in English for a shop that lists no language', async () => {
    const { catalog, text, run } = setUp();
    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ languages: [] }));

    await run('text');

    expect(text.writeListingText).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en-US' }),
    );
    expect(text.translateListingText).not.toHaveBeenCalled();
  });
});
