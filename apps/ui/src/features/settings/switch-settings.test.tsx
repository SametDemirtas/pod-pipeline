import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('AI-made designs setting', () => {
  it('cites Etsy’s rule and saves the choice', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const toggle = await screen.findByRole('switch', { name: 'My designs are made with AI tools' });

    expect(toggle).toHaveAccessibleDescription(/must disclose within their listing description/);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(api.updateSettings).toHaveBeenCalledWith({ aiDesigns: true });
    expect(
      await screen.findByRole('switch', {
        name: 'My designs are made with AI tools',
        checked: true,
      }),
    ).toBeInTheDocument();
  });
});

describe('switch settings', () => {
  it('keep the focus and take no second change while one saves', async () => {
    const { api } = createFakeApi([]);
    let saved: () => void = () => undefined;
    const save = api.updateSettings.getMockImplementation();
    api.updateSettings.mockImplementationOnce(
      (change) =>
        new Promise((resolve, reject) => {
          saved = () => {
            save?.(change).then(resolve, reject);
          };
        }),
    );
    const { user } = await renderApp(api, '/settings');
    const toggle = await screen.findByRole('switch', { name: 'My designs are made with AI tools' });

    await user.click(toggle);
    await user.click(toggle);

    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    saved();
    expect(
      await screen.findByRole('switch', {
        name: 'My designs are made with AI tools',
        checked: true,
      }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Samsung cases setting', () => {
  it('is on until the seller turns it off', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const toggle = await screen.findByRole('switch', {
      name: 'Also make Samsung cases from iPhone case artwork',
    });

    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/makes an iPhone case and a Samsung case/);
    await user.click(toggle);

    expect(api.updateSettings).toHaveBeenCalledWith({ samsungFromIphone: false });
    expect((await api.getSettings()).samsungFromIphone).toBe(false);
  });
});

describe('upscaling setting', () => {
  it('saves the model and whether prepared listings upscale, which starts off', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const toggle = await screen.findByRole('switch', {
      name: 'Upscale low-resolution artwork when preparing listings',
    });

    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('combobox', { name: 'Model' }));
    await user.click(await screen.findByRole('option', { name: 'Photo' }));

    expect(api.updateSettings).toHaveBeenCalledWith({ autoUpscale: true });
    expect(api.updateSettings).toHaveBeenCalledWith({ upscaleModel: 'photo' });
    expect(await api.getSettings()).toMatchObject({ autoUpscale: true, upscaleModel: 'photo' });
  });
});
