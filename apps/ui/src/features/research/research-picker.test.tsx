import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, LISTING_WRITER_LIMITS } from '@pod/contracts/client';
import { renderApp } from '../../testing/render-app.js';
import { withWriter } from '../../testing/research.js';

describe('research for the listing writer', () => {
  it('fills Claude’s search words from an earlier search, and tells Claude what it found', async () => {
    const fake = await withWriter();
    await fake.api.researchKeywords({ query: 'tulip mug', market: 'DE' });
    const { user } = await renderApp(fake.api, '/designs/id-01-mug');

    await user.type(await screen.findByLabelText('Search words (optional)'), 'Tulip Mug, cute');
    await user.click(await screen.findByRole('combobox', { name: 'Use words from research' }));
    await user.click(await screen.findByRole('option', { name: 'tulip mug (Germany)' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Search words (optional)')).toHaveValue(
        'Tulip Mug, cute, halloween coffee mug, a phrase far too long for a tag, mug',
      );
    });
    await user.click(screen.getByRole('button', { name: 'Write with Claude' }));
    expect(fake.api.writeListingText).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: [
          { term: 'Tulip Mug', market: 'DE', suggested: true },
          { term: 'cute' },
          { term: 'halloween coffee mug', market: 'DE', suggested: false, shops: 1 },
          { term: 'a phrase far too long for a tag', market: 'DE', suggested: false, shops: 1 },
          { term: 'mug', market: 'DE', suggested: false, shops: 3 },
        ],
      }),
    );
  });

  it('fills Claude’s search words from a keyword list, without trademarks and up to the limit', async () => {
    const fake = await withWriter();
    await fake.api.importKeywordList({});
    const { user } = await renderApp(fake.api, '/designs/id-01-mug');
    const typed = Array.from({ length: LISTING_WRITER_LIMITS.keywords - 2 }, (_, i) => `w${i}`);

    await user.type(await screen.findByLabelText('Search words (optional)'), typed.join(', '));
    await user.click(await screen.findByRole('combobox', { name: 'Use words from research' }));
    await user.click(
      await screen.findByRole('option', { name: 'erank-tulip-mug.csv (United States)' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Search words (optional)')).toHaveValue(
        [...typed, 'tulip mug gift', 'spooky mug'].join(', '),
      );
    });
    expect(screen.getByText('20 of 20 search words; the most important first')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Write with Claude' }));
    const [request] = fake.api.writeListingText.mock.calls[0] ?? [];
    expect(request?.keywords?.slice(-2)).toEqual([
      { term: 'tulip mug gift', market: 'US', searches: 12_345 },
      { term: 'spooky mug', market: 'US' },
    ]);
  });

  it('says so when an earlier search cannot be read', async () => {
    const fake = await withWriter();
    await fake.api.researchKeywords({ query: 'tulip mug' });
    fake.api.getResearch.mockRejectedValueOnce(
      new ApiError({ code: 'NOT_FOUND', message: 'x', details: {} }),
    );
    const { user } = await renderApp(fake.api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('combobox', { name: 'Use words from research' }));
    await user.click(await screen.findByRole('option', { name: 'tulip mug (United States)' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Search words (optional)')).toHaveValue('');
  });

  it('says the research could not be loaded, and waits while a pick is read', async () => {
    const fake = await withWriter();
    await fake.api.importKeywordList({});
    fake.api.listResearch.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    let answer: () => void = () => undefined;
    const read = fake.api.getKeywordList.getMockImplementation();
    fake.api.getKeywordList.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          answer = () => {
            if (read) resolve(read(request));
          };
        }),
    );
    const { user } = await renderApp(fake.api, '/designs/id-01-mug');

    const picker = await screen.findByRole('combobox', { name: 'Use words from research' });
    await waitFor(() => {
      expect(picker).toHaveTextContent('Research could not be loaded');
    });
    await user.click(picker);
    await user.click(
      await screen.findByRole('option', { name: 'erank-tulip-mug.csv (United States)' }),
    );
    await waitFor(() => {
      expect(picker).toBeDisabled();
    });
    answer();
    await waitFor(() => {
      expect(picker).not.toBeDisabled();
    });
  });
});
