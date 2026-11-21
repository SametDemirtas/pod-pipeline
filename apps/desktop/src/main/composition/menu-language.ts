import type { UiLanguage } from '@pod/contracts';
import type { SettingsStore } from '../application/settings/settings-store.js';

type Settings = Pick<SettingsStore, 'get' | 'update'>;

/**
 * Shows the menus in the saved language, or `fallback` when the settings cannot
 * be read, and again whenever the seller saves the settings.
 */
export async function withMenuLanguage(
  settings: Settings,
  showMenu: (language: UiLanguage) => void,
  fallback: UiLanguage,
): Promise<Settings> {
  const { language } = await settings.get().catch(() => ({ language: fallback }));
  showMenu(language);
  return {
    get: () => settings.get(),
    update: async (request) => {
      const saved = await settings.update(request);
      showMenu(saved.language);
      return saved;
    },
  };
}
