import { screen, waitFor, within, type BoundFunctions, type queries } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../../testing/fake-api.js';
import { renderApp } from '../../../testing/render-app.js';

type User = Awaited<ReturnType<typeof renderApp>>['user'];
type Area = BoundFunctions<typeof queries>;

/** The settings section under `title`, e.g. Text AI. */
const section = async (title: string) =>
  within((await screen.findByRole('heading', { name: title })).parentElement as HTMLElement);

async function choose(user: User, area: Area, select: string, option: string) {
  await user.click(area.getByRole('combobox', { name: select }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function optionsOf(user: User, area: Area, select: string) {
  await user.click(area.getByRole('combobox', { name: select }));
  const names = (await screen.findAllByRole('option')).map((option) => option.textContent);
  await user.keyboard('{Escape}');
  return names;
}

describe('AI settings', () => {
  it('connects the text service and saves only models other than the default', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const text = await section('Text AI');

    const key = text.getByLabelText('Anthropic API key');
    expect(key).toHaveAttribute('type', 'password');
    expect(text.getByRole('link', { name: 'Create a key' })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/settings/keys',
    );
    await user.type(key, 'sk-ant-key');
    await user.click(text.getByRole('button', { name: 'Connect Claude' }));

    expect(api.connectAi).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-key' });
    expect(await text.findByText('Connected with your Claude API key')).toBeInTheDocument();
    expect(text.getByRole('combobox', { name: 'Writing model' })).toHaveTextContent(
      'claude-opus-5-5 (default)',
    );
    await choose(user, text, 'Writing model', 'claude-haiku-5-5');
    expect(api.updateSettings).toHaveBeenLastCalledWith({ textModel: 'claude-haiku-5-5' });
    await waitFor(() => {
      expect(text.getByRole('combobox', { name: 'Writing model' })).toHaveTextContent(
        'claude-haiku-5-5',
      );
    });
    await choose(user, text, 'Writing model', 'claude-opus-5-5 (default)');
    expect(api.updateSettings).toHaveBeenLastCalledWith({ textModel: null });
    await choose(user, text, 'Checking model', 'claude-sonnet-5-5');
    expect(api.updateSettings).toHaveBeenLastCalledWith({ checkModel: 'claude-sonnet-5-5' });
  });

  it('shows the key field and models of the service the seller switches to', async () => {
    const { api } = createFakeApi([]);
    await api.connectAi({ provider: 'openai', apiKey: 'sk-openai' });
    const { user } = await renderApp(api, '/settings');
    const text = await section('Text AI');

    await choose(user, text, 'Service', 'Kimi');

    expect(api.updateSettings).toHaveBeenLastCalledWith({ textProvider: 'kimi' });
    expect(await text.findByLabelText('Moonshot API key')).toHaveValue('');
    expect(text.getByRole('combobox', { name: 'Service' })).toHaveFocus();
    expect(text.getByText(/moonshot\.cn, are not supported/)).toBeInTheDocument();
    expect(text.queryByRole('combobox', { name: 'Writing model' })).not.toBeInTheDocument();

    await choose(user, text, 'Service', 'ChatGPT');

    expect(await text.findByText('Connected with your ChatGPT API key')).toBeInTheDocument();
    expect(text.getByRole('combobox', { name: 'Writing model' })).toHaveTextContent(
      'gpt-6.1-sol (default)',
    );
    expect(text.getByRole('combobox', { name: 'Checking model' })).toHaveTextContent(
      'gpt-6-luna (default)',
    );
  });

  it('offers only models that read images for checking scenes', async () => {
    const { api } = createFakeApi([]);
    await api.connectAi({ provider: 'deepseek', apiKey: 'sk-deepseek' });
    await api.updateSettings({ textProvider: 'deepseek' });
    const { user } = await renderApp(api, '/settings');
    const text = await section('Text AI');
    await text.findByText('Connected with your DeepSeek API key');

    expect(await optionsOf(user, text, 'Writing model')).toEqual([
      'deepseek-v4-pro',
      'deepseek-flash (default)',
      'Another model…',
    ]);
    // A model DeepSeek does not list may not read images, so none can be typed in.
    expect(await optionsOf(user, text, 'Checking model')).toEqual(['deepseek-flash (default)']);
  });

  it('shares one key between text and scenes when both use the same service', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const image = await section('Image AI');
    expect(image.getByText(/serves both text and scene photos/)).toBeInTheDocument();

    await user.type(image.getByLabelText('Gemini API key'), 'gk');
    await user.click(image.getByRole('button', { name: 'Connect Gemini' }));
    expect(api.connectAi).toHaveBeenCalledWith({ provider: 'gemini', apiKey: 'gk' });
    await image.findByText('Connected with your Gemini API key');
    await choose(user, await section('Text AI'), 'Service', 'Gemini');

    await waitFor(() => {
      expect(screen.getAllByText('Connected with your Gemini API key')).toHaveLength(2);
    });
  });

  it('lets the seller enter a scene model the list does not offer, and go back', async () => {
    const { api } = createFakeApi([]);
    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    const { user } = await renderApp(api, '/settings');
    const image = await section('Image AI');
    await image.findByText('Connected with your Gemini API key');

    await choose(user, image, 'Scene model', 'Another model…');
    const model = image.getByLabelText('Model ID');
    expect(model).toHaveFocus();
    expect(model).toHaveAttribute('maxLength', '100');
    const save = image.getByRole('button', { name: 'Save model' });
    expect(save).toBeDisabled();
    await user.type(model, 'Gemini/Nano');
    expect(model).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();
    await user.clear(model);
    await user.type(model, ' gemini-nano-banana-3 ');
    await user.click(save);

    expect(api.updateSettings).toHaveBeenLastCalledWith({ sceneModel: 'gemini-nano-banana-3' });
    await waitFor(() => {
      expect(image.getByRole('combobox', { name: 'Scene model' })).toHaveTextContent(
        'gemini-nano-banana-3',
      );
    });
    expect(image.queryByLabelText('Model ID')).not.toBeInTheDocument();
    await choose(user, image, 'Scene model', 'Another model…');
    await user.click(image.getByRole('button', { name: 'Cancel' }));
    expect(image.queryByLabelText('Model ID')).not.toBeInTheDocument();
    await choose(user, image, 'Scene model', 'gemini-nano-banana-2.1 (default)');
    expect(api.updateSettings).toHaveBeenLastCalledWith({ sceneModel: null });
  });

  it('switches the image service, which resets its model', async () => {
    const { api } = createFakeApi([]);
    await api.connectAi({ provider: 'openai', apiKey: 'sk-openai' });
    const { user } = await renderApp(api, '/settings');

    await choose(user, await section('Image AI'), 'Service', 'ChatGPT');

    expect(api.updateSettings).toHaveBeenLastCalledWith({ sceneProvider: 'openai' });
    await screen.findByText('Connected with your ChatGPT API key');
    expect(
      (await section('Image AI')).getByRole('combobox', { name: 'Scene model' }),
    ).toHaveTextContent('gpt-image-2.5-sunburst (default)');
  });
});
