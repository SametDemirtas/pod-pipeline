import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { fillDraft, withMockups } from '../../testing/listing.js';
import { queryKeys } from '../../api/query-keys.js';
import { renderApp } from '../../testing/render-app.js';

describe('listing text checks', () => {
  it('names the brand the text must not mention', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({ code: 'OTHER_BRAND_NAMED', message: 'x', details: { brands: ['Samsung'] } }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);

    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(
      await screen.findByText(/The text names Samsung, which this product is not made for/),
    ).toBeInTheDocument();
  });

  it('flags trademarks in what Claude wrote and counts the search words', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.writeListingText.mockResolvedValueOnce({
      title: 'Star Wars Mug',
      description: 'A mug.',
      tags: ['nfl fan gift'],
      humanizer: { fixed: 0, left: [] },
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(form.getByLabelText('Notes for Claude (optional)')).toHaveAttribute('maxlength', '1000');
    await user.type(form.getByLabelText('Search words (optional)'), 'tulip mug, tea');
    expect(form.getByLabelText('Search words (optional)')).toHaveAccessibleDescription(
      '2 of 20 search words; the most important first',
    );
    await user.click(form.getByRole('button', { name: 'Write with Claude' }));

    expect(
      await form.findByText(/The title or tags may name trademarks: Star Wars and NFL\./),
    ).toBeInTheDocument();
    expect(form.getByLabelText('Title')).toHaveValue('Star Wars Mug');

    // The warning follows the seller's edits, so it goes once the names are replaced.
    await user.clear(form.getByLabelText('Title'));
    await user.type(form.getByLabelText('Title'), 'Space Battle Mug');
    await user.clear(form.getByLabelText('Tags'));
    await user.type(form.getByLabelText('Tags'), 'football fan gift');
    await waitFor(() => {
      expect(form.queryByText(/may name trademarks/)).not.toBeInTheDocument();
    });
  });

  it('names phrases that read as machine-written as the seller edits, and what Claude fixed', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.writeListingText.mockResolvedValueOnce({
      title: 'Tulip Mug',
      description: 'Elevate your tea time.',
      tags: ['tulip mug'],
      humanizer: {
        fixed: 1,
        left: [{ category: 'hype', field: 'description', match: 'Elevate your' }],
      },
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    // The title the form starts with is checked too.
    expect(await form.findByText('AI check: no AI-sounding phrases found.')).toBeInTheDocument();

    await user.click(form.getByRole('button', { name: 'Write with Claude' }));
    // What Claude fixed comes first, then what is left.
    const fixed = await form.findByText('AI check: fixed 1 AI-sounding phrase.');
    const left = form.getByText('AI check: 1 AI-sounding phrase left. Edit it by hand:');
    expect(fixed.compareDocumentPosition(left)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      within(form.getByRole('list', { name: 'AI-sounding phrases' })).getByText('Elevate your'),
    ).toBeInTheDocument();

    await user.type(form.getByLabelText('Description'), ' Look no further.');
    expect(
      await form.findByText('AI check: 2 AI-sounding phrases left. Edit them by hand:'),
    ).toBeInTheDocument();
    expect(api.checkListingText).toHaveBeenLastCalledWith({
      language: 'en-US',
      title: 'Tulip Mug',
      description: 'Elevate your tea time. Look no further.',
      tags: ['tulip mug'],
      designName: 'Lantern Harbor',
    });
    // The fix was to Claude's words, which the seller has changed since.
    expect(form.queryByText(/fixed 1/)).not.toBeInTheDocument();

    await user.clear(form.getByLabelText('Description'));
    await user.type(form.getByLabelText('Description'), 'A mug with a tulip.');
    expect(await form.findByText('AI check: no AI-sounding phrases found.')).toBeInTheDocument();
  });

  it('says the check is unavailable while it fails, and checks again on request', async () => {
    const { api } = await withMockups();
    api.checkListingText.mockRejectedValueOnce(new Error('offline'));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(await form.findByText(/The text check is unavailable/)).toBeInTheDocument();
    expect(form.queryByText(/^AI check:/)).not.toBeInTheDocument();

    await user.click(form.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(form.queryByText(/The text check is unavailable/)).not.toBeInTheDocument();
    });
    expect(api.checkListingText).toHaveBeenCalledTimes(2);
  });

  it('checks nothing while the title, description and tags are empty', async () => {
    const { api } = await withMockups();
    const { user, queryClient } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await waitFor(() => {
      expect(api.checkListingText).toHaveBeenCalled();
    });
    const empty = queryKeys.listingTextCheck('en-US', 'Lantern Harbor', {
      title: '',
      description: '',
      tags: '',
    });

    await user.clear(form.getByLabelText('Title'));
    await user.clear(form.getByLabelText('Tags'));
    await user.type(form.getByLabelText('Description'), 'Cosy');
    await waitFor(() => {
      expect(api.checkListingText).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: '', description: 'Cosy' }),
      );
    });
    const calls = api.checkListingText.mock.calls.length;
    await user.clear(form.getByLabelText('Description'));

    // The words settle once typing pauses; the check for no words is then set up but never asked.
    await waitFor(() => {
      expect(queryClient.getQueryState(empty)).toBeDefined();
    });
    expect(queryClient.getQueryState(empty)?.fetchStatus).toBe('idle');
    expect(api.checkListingText).toHaveBeenCalledTimes(calls);
  });

  it('lists a scene only once its print is confirmed, then notes that it is an AI scene', async () => {
    const { api } = await withMockups();
    const [photo] = await api.listMockups({ id: 'id-01-mug' });
    const {
      scenes: [scene],
    } = await api.createScene({
      designId: 'id-01-mug',
      mockupId: photo?.id ?? '',
      prompt: 'On a desk',
      look: { shape: '4:3' },
      candidates: 1,
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    const sceneChoice = form.getByRole('checkbox', { name: /Scene/ });
    expect(sceneChoice).toBeDisabled();
    expect(sceneChoice).not.toBeChecked();
    expect(
      form.getByText('Tick “I checked the print” under this scene first.'),
    ).toBeInTheDocument();
    expect(form.queryByText(/a note saying so is added/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'I checked the print' }));
    expect(api.confirmScenePrint).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      mockupId: scene?.id ?? '',
      confirmed: true,
    });
    await waitFor(() => {
      expect(sceneChoice).toBeEnabled();
    });
    await user.click(sceneChoice);

    expect(
      form.getByText(/a note saying so is added to the end of the description/),
    ).toBeInTheDocument();
    // The note's room is kept free, so the description cannot crowd it out.
    expect(form.getByText('0 of 9,804 characters')).toBeInTheDocument();
  });

  it('notes that designs made with AI tools are disclosed, in one note with AI scenes', async () => {
    const { api } = await withMockups();
    await api.updateSettings({ aiDesigns: true });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(
      form.getByText(/Your designs are made with AI tools \(see Settings\)/),
    ).toBeInTheDocument();
    expect(form.getByText('0 of 9,804 characters')).toBeInTheDocument();

    const [photo] = await api.listMockups({ id: 'id-01-mug' });
    await api.createScene({
      designId: 'id-01-mug',
      mockupId: photo?.id ?? '',
      prompt: 'On a desk',
      look: { shape: '4:3' },
      candidates: 1,
    });
    const [scene] = await api.listMockups({ id: 'id-01-mug' });
    await api.confirmScenePrint({
      designId: 'id-01-mug',
      mockupId: scene?.id ?? '',
      confirmed: true,
    });
    await user.click(screen.getByRole('link', { name: /Designs/ }));
    await user.click(await screen.findByRole('link', { name: /^01-mug,/ }));
    const again = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    // The form waits for the batch text, by when the confirmed scene is among the newest photos.
    expect(again.getByRole('checkbox', { name: /Scene/ })).toBeChecked();

    expect(again.getByText(/one note saying both is added/)).toBeInTheDocument();
  });
});
