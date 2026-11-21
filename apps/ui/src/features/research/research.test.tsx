import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, researchRunDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('Etsy research', () => {
  it('searches Etsy in the chosen market, shows what the results say and keeps the search', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/research');

    expect(await screen.findByText('No searches yet.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search on Etsy' }), ' tulip mug ');
    await user.click(screen.getByRole('combobox', { name: 'Etsy market' }));
    await user.click(await screen.findByRole('option', { name: 'Germany (beta)' }));
    await user.click(screen.getByRole('button', { name: 'Search Etsy' }));

    expect(api.researchKeywords).toHaveBeenCalledWith({ query: 'tulip mug', market: 'DE' });
    expect(
      await screen.findByRole('heading', { name: 'What “tulip mug” shows (Germany)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Beta: Etsy’s page words in this market are not yet checked/),
    ).toBeVisible();
    expect(screen.getByText('1,000+')).toBeInTheDocument();
    expect(screen.getByText('$18.00 to $22.00, half below $20.00')).toBeInTheDocument();
    expect(screen.getByText(/2 listings: 50% ads, 50% Star Sellers/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Etsy suggestions' })).getByText('tulip mug ceramic'),
    ).toBeInTheDocument();
    const terms = within(screen.getAllByRole('table')[0] as HTMLElement);
    const trademark = terms.getByRole('rowheader', { name: /disney tulip mug/ });
    expect(within(trademark).getByText('Trademark')).toBeInTheDocument();
    expect(terms.getByText('3 shops, 4 titles (100%)')).toBeInTheDocument();
    expect(terms.getAllByText('2 shops, 2 titles (100%)')).toHaveLength(3);
    const listings = within(screen.getAllByRole('table')[1] as HTMLElement);
    expect(listings.getByText('Ad')).toBeInTheDocument();
    expect(listings.getByText("Etsy's Pick")).toBeInTheDocument();
    expect(listings.getByText('–')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'tulip mug' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
    expect(screen.getByText(/^Germany, /)).toBeInTheDocument();
  });

  it('copies the phrases that fit as tags, searched ones first and no trademarks', async () => {
    const { api } = createFakeApi([]);
    await api.researchKeywords({ query: 'tulip mug' });
    const { user } = await renderApp(api, '/research/run-1');
    // After rendering, since the user-event setup brings a clipboard of its own.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(await screen.findByRole('button', { name: 'Copy as tags' }));
    expect(screen.queryByText(/^Beta:/)).not.toBeInTheDocument();

    // The tags the app picked for the search, in its order.
    expect(writeText).toHaveBeenCalledWith('tulip mug, halloween coffee mug');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Copy as tags' })).toBeInTheDocument();
  });

  it('says when Etsy sent no suggestions or its page could not be read in full', async () => {
    const { api } = createFakeApi([]);
    const run = researchRunDto('run-9', 'tulip mug');
    api.getResearch.mockResolvedValueOnce({
      ...run,
      report: {
        ...run.report,
        suggestions: [],
        suggestionsAvailable: false,
        warnings: ['cardsUnread', 'pricesUnread', 'otherCurrency'],
      },
    });
    await renderApp(api, '/research/run-9');

    expect(await screen.findByText(/Etsy did not send suggestions this time/)).toBeInTheDocument();
    expect(screen.getByText(/so some results could not be read/)).toBeVisible();
    expect(screen.getByText(/the price range may be incomplete/)).toBeVisible();
    expect(screen.getByText(/in a different currency from this market’s/)).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Etsy suggestions' })).not.toBeInTheDocument();
  });

  it('marks phrases only ads use, without a share of the results', async () => {
    const { api } = createFakeApi([]);
    const run = researchRunDto('run-9', 'tulip mug');
    const adOnly = {
      term: 'spooky tulip cup',
      listings: 0,
      shops: 0,
      ads: 2,
      share: 0,
      suggested: false,
      trademark: false,
      partOfLonger: null,
      adOnly: true,
    };
    api.getResearch.mockResolvedValueOnce({
      ...run,
      report: { ...run.report, terms: [adOnly, ...run.report.terms] },
    });
    await renderApp(api, '/research/run-9');

    const row = await screen.findByRole('row', { name: /spooky tulip cup/ });
    expect(within(row).getByText('Only in ads')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('%');
    expect(row).toHaveTextContent('2');
  });

  it('says how long to wait when Etsy was searched too often', async () => {
    const limited = (retryAfterSeconds: number) =>
      new ApiError({ code: 'RESEARCH_RATE_LIMITED', message: 'x', details: { retryAfterSeconds } });
    const { api } = createFakeApi([]);
    api.researchKeywords.mockRejectedValueOnce(limited(45)).mockRejectedValueOnce(limited(590));
    const { user } = await renderApp(api, '/research');

    await user.type(await screen.findByRole('textbox', { name: 'Search on Etsy' }), 'tulip');
    await user.click(screen.getByRole('button', { name: 'Search Etsy' }));
    expect(await screen.findByText(/Search again in 45 seconds\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search Etsy' }));
    expect(await screen.findByText(/Search again in 10 minutes\./)).toBeInTheDocument();
  });

  it('explains when Etsy kept asking for a person or changed its page', async () => {
    const { api } = createFakeApi([]);
    api.researchKeywords
      .mockRejectedValueOnce(new ApiError({ code: 'RESEARCH_BLOCKED', message: 'x', details: {} }))
      .mockRejectedValueOnce(
        new ApiError({ code: 'RESEARCH_PAGE_CHANGED', message: 'x', details: {} }),
      );
    const { user } = await renderApp(api, '/research');

    await user.type(await screen.findByRole('textbox', { name: 'Search on Etsy' }), 'tulip');
    await user.click(screen.getByRole('button', { name: 'Search Etsy' }));
    expect(await screen.findByText(/pass the check in the window that opens/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search Etsy' }));
    expect(await screen.findByText(/search page has changed/)).toBeInTheDocument();
  });

  it('offers a retry when the earlier searches cannot be read', async () => {
    const { api } = createFakeApi([]);
    api.listResearch.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/research');

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No searches yet.')).toBeInTheDocument();
  });

  it('names the suggestions and Etsy’s badges in the seller’s language', async () => {
    const { api } = createFakeApi([]);
    await api.researchKeywords({ query: 'tulip mug' });
    await renderApp(api, '/research/run-1', 'de');

    expect(await screen.findByRole('heading', { name: 'Etsy-Vorschläge' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Etsy-Vorschläge' })).toBeInTheDocument();
    const listings = within(screen.getAllByRole('table')[1] as HTMLElement);
    expect(listings.getByText('Auswahl von Etsy')).toBeInTheDocument();
  });

  it('shows the earlier searches and keyword lists loading', async () => {
    const { api } = createFakeApi([]);
    api.listResearch.mockReturnValueOnce(new Promise(() => undefined));
    api.listKeywordLists.mockReturnValueOnce(new Promise(() => undefined));
    await renderApp(api, '/research');

    for (const name of ['Earlier searches', 'Keyword lists']) {
      const section = within(
        (await screen.findByRole('heading', { name })).parentElement as HTMLElement,
      );
      expect(section.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    }
  });
});
