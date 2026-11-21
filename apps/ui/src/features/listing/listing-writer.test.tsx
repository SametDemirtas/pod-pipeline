import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { humanizer, withMockups } from '../../testing/listing.js';
import { renderApp } from '../../testing/render-app.js';

describe('listing writer and translations', () => {
  it('lets Claude write the text, translates it and sends only current translations', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.type(form.getByLabelText('Search words (optional)'), 'tulip mug, tea');
    await user.type(form.getByLabelText('Notes for Claude (optional)'), 'Dishwasher safe');
    await user.click(form.getByRole('button', { name: 'Write with Claude' }));

    expect(api.writeListingText).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      language: 'en-US',
      variantIds: expect.any(Array) as string[],
      keywords: [{ term: 'tulip mug' }, { term: 'tea' }],
      notes: 'Dishwasher safe',
    });
    await waitFor(() => {
      expect(form.getByLabelText('Title')).toHaveValue('Lantern Harbor Mug for Bird Lovers');
    });
    expect(form.getByLabelText('Tags')).toHaveValue('tulip mug, bird lover gift');
    expect(await form.findByText('AI check: fixed 2 AI-sounding phrases.')).toBeInTheDocument();

    const languages = within(form.getByRole('group', { name: 'Translations' }));
    await user.click(languages.getByRole('checkbox', { name: 'German' }));
    await user.click(form.getByRole('button', { name: 'Translate with Claude' }));
    expect(api.translateListingText).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ['de'], familyId: 'mug' }),
    );
    expect(await form.findByText('[de] Lantern Harbor Mug for Bird Lovers')).toBeInTheDocument();
    expect(form.getByText('AI check: no AI-sounding phrases found.')).toBeInTheDocument();

    await user.type(form.getByLabelText('Title'), '!');
    expect(await form.findByText(/The text changed after translating/)).toBeInTheDocument();
    await user.type(form.getByLabelText('Title'), '{Backspace}');
    await user.type(form.getByLabelText('Price (USD)'), '19.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: [
          {
            language: 'de',
            title: '[de] Lantern Harbor Mug for Bird Lovers',
            description: '[de] A cosy mug written by Claude.',
            tags: ['tulip mug', 'bird lover gift'],
          },
        ],
      }),
    );
  });

  it('asks before replacing a description the seller wrote', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await user.type(form.getByLabelText('Description'), 'My own words.');

    await user.click(form.getByRole('button', { name: 'Write with Claude' }));
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Replace what you wrote?' }),
    );
    expect(api.writeListingText).not.toHaveBeenCalled();
    await user.click(confirm.getByRole('button', { name: 'Write with Claude' }));

    expect(api.writeListingText).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(form.getByLabelText('Description')).not.toHaveValue('My own words.');
    });
  });

  it('starts with the text a batch job wrote, which the seller may edit or replace', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.getBatchListingText.mockResolvedValue({
      language: 'en-US',
      title: 'Lantern Harbor Mug, Spooky Reader Gift',
      description: 'A cosy mug the batch wrote.',
      tags: ['tulip mug', 'bird lover gift'],
      translations: [
        {
          language: 'de',
          title: 'Geister-Buchclub-Tasse',
          description: 'Eine gemütliche Tasse.',
          tags: ['geistertasse'],
        },
      ],
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(api.getBatchListingText).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(form.getByLabelText('Title')).toHaveValue('Lantern Harbor Mug, Spooky Reader Gift');
    expect(form.getByLabelText('Description')).toHaveValue('A cosy mug the batch wrote.');
    expect(form.getByLabelText('Tags')).toHaveValue('tulip mug, bird lover gift');
    const languages = within(form.getByRole('group', { name: 'Translations' }));
    expect(languages.getByRole('checkbox', { name: 'German' })).toBeChecked();
    expect(form.getByText('Geister-Buchclub-Tasse')).toBeInTheDocument();
    expect(form.queryByText(/The text changed after translating/)).not.toBeInTheDocument();

    await user.type(form.getByLabelText('Price (USD)'), '19.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Lantern Harbor Mug, Spooky Reader Gift',
        description: 'A cosy mug the batch wrote.',
        tags: ['tulip mug', 'bird lover gift'],
        translations: [
          {
            language: 'de',
            title: 'Geister-Buchclub-Tasse',
            description: 'Eine gemütliche Tasse.',
            tags: ['geistertasse'],
          },
        ],
      }),
    );
  });

  it('checks the translations a batch job wrote itself, and says when it could not', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.getBatchListingText.mockResolvedValue({
      language: 'en-US',
      title: 'Lantern Harbor Mug',
      description: 'A cosy mug.',
      tags: [],
      translations: [
        { language: 'de', title: 'Geistertasse', description: 'Elevate your tea.', tags: [] },
      ],
    });
    const first = await renderApp(api, '/designs/id-01-mug');
    let form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(
      await form.findByText('AI check: 1 AI-sounding phrase left. Edit it by hand:'),
    ).toBeInTheDocument();
    expect(api.checkListingText).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de', title: 'Geistertasse' }),
    );
    first.unmount();

    api.checkListingText.mockRejectedValue(new Error('offline'));
    await renderApp(api, '/designs/id-01-mug');
    form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    expect(
      await form.findByText('AI check: these words were not checked for AI-sounding phrases.'),
    ).toBeInTheDocument();
    expect(form.queryByText('AI check: no AI-sounding phrases found.')).not.toBeInTheDocument();
  });

  it('asks before Claude replaces the text a batch job wrote', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.getBatchListingText.mockResolvedValue({
      language: 'en-US',
      title: 'Batch Title',
      description: 'Batch words.',
      tags: [],
      translations: [],
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.click(form.getByRole('button', { name: 'Write with Claude' }));
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Replace what you wrote?' }),
    );
    await user.click(confirm.getByRole('button', { name: 'Write with Claude' }));

    await waitFor(() => {
      expect(form.getByLabelText('Title')).toHaveValue('Lantern Harbor Mug for Bird Lovers');
    });
  });

  it('names the languages Claude could not translate', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.translateListingText.mockImplementationOnce((request) =>
      Promise.resolve({
        translations: [{ language: 'de', ...request, title: `[de] ${request.title}`, humanizer }],
        failed: ['fr'],
      }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.click(form.getByRole('checkbox', { name: 'German' }));
    await user.click(form.getByRole('checkbox', { name: 'French' }));
    await user.click(form.getByRole('button', { name: 'Translate with Claude' }));

    expect(
      await form.findByText('Not translated: French. Translate again to add them.'),
    ).toBeInTheDocument();
  });

  it('points to the settings while Claude is not connected', async () => {
    const { api } = await withMockups();
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await screen.findByText(
        'Connect Claude in the settings to have the listing text written for you.',
      ),
    ).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Etsy draft' });
    for (const link of within(form).getAllByRole('link', { name: 'Open settings' })) {
      expect(link).toHaveAttribute('href', '#/settings');
    }
    expect(screen.queryByRole('button', { name: 'Write with Claude' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Translations' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your shop's other languages: German and French. Connect Claude to translate the listing into them.",
      ),
    ).toBeInTheDocument();
  });

  it('names the text service chosen in the settings and its own key', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    await api.updateSettings({ textProvider: 'openai' });
    const first = await renderApp(api, '/designs/id-01-mug');

    expect(
      await screen.findByText(
        'Connect ChatGPT in the settings to have the listing text written for you.',
      ),
    ).toBeInTheDocument();
    first.unmount();
    await api.connectAi({ provider: 'openai', apiKey: 'sk-openai' });
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByRole('button', { name: 'Write with ChatGPT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Translate with ChatGPT' })).toBeInTheDocument();
    expect(screen.getByLabelText('Notes for ChatGPT (optional)')).toBeInTheDocument();
  });

  it('shows why Claude could not write', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    api.writeListingText.mockRejectedValueOnce(
      new ApiError({ code: 'AI_NOT_CONNECTED', message: 'x', details: { service: 'Claude' } }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Write with Claude' }));

    expect(
      await screen.findByText('Claude has no working key. Add one in the settings first.'),
    ).toBeInTheDocument();
  });

  it('marks a translation outdated when the text changed while Claude translated', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    let finish: () => void = () => undefined;
    api.translateListingText.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          finish = () => {
            resolve({
              translations: [
                { language: 'de', ...request, title: `[de] ${request.title}`, humanizer },
              ],
              failed: [],
            });
          };
        }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.click(form.getByRole('checkbox', { name: 'German' }));
    await user.click(form.getByRole('button', { name: 'Translate with Claude' }));

    await user.type(form.getByLabelText('Title'), ' edited');
    finish();

    expect(await form.findByText(/The text changed after translating/)).toBeInTheDocument();
    await user.type(form.getByLabelText('Price (USD)'), '19.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(api.createListing.mock.calls[0]?.[0]).not.toHaveProperty('translations');
  });

  it('leaves out languages unticked after translating', async () => {
    const { api } = await withMockups();
    await api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.click(form.getByRole('checkbox', { name: 'German' }));
    await user.click(form.getByRole('checkbox', { name: 'French' }));
    await user.click(form.getByRole('button', { name: 'Translate with Claude' }));
    expect((await form.findAllByText(/\[fr\]/)).length).toBeGreaterThan(0);

    await user.click(form.getByRole('checkbox', { name: 'French' }));
    await user.type(form.getByLabelText('Price (USD)'), '19.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    const sent = api.createListing.mock.calls[0]?.[0];
    expect(sent?.translations?.map((translation) => translation.language)).toEqual(['de']);
  });
});
