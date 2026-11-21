import { describe, expect, it, vi } from 'vitest';
import type { SettingsDto } from '@pod/contracts';
import { withMenuLanguage } from './menu-language.js';

const settingsIn = (language: SettingsDto['language']) => ({ language }) as SettingsDto;

describe('withMenuLanguage', () => {
  it('shows the menus in the saved language, and again after the seller picks another', async () => {
    const showMenu = vi.fn();
    const store = {
      get: vi.fn(() => Promise.resolve(settingsIn('de'))),
      update: vi.fn(() => Promise.resolve(settingsIn('tr'))),
    };

    const settings = await withMenuLanguage(store, showMenu, 'en');
    expect(showMenu).toHaveBeenLastCalledWith('de');
    expect(await settings.get()).toEqual(settingsIn('de'));
    expect(await settings.update({ language: 'tr' })).toEqual(settingsIn('tr'));

    expect(store.update).toHaveBeenCalledWith({ language: 'tr' });
    expect(showMenu).toHaveBeenLastCalledWith('tr');
  });

  it('falls back to the default language when the settings cannot be read', async () => {
    const showMenu = vi.fn();
    const store = {
      get: vi.fn(() => Promise.reject(new Error('unreadable'))),
      update: vi.fn(() => Promise.resolve(settingsIn('en'))),
    };

    await withMenuLanguage(store, showMenu, 'tr');

    expect(showMenu).toHaveBeenCalledWith('tr');
  });
});
