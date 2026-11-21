import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UI_LANGUAGES, type DesktopBridge } from '@pod/contracts/client';
import { createDesktopApi } from '../api/desktop-api.js';
import { createI18n } from '../i18n/i18n.js';
import { App } from './App.js';
import { NoDesktopPage } from './NoDesktopPage.js';

/**
 * Renders the app into `element`. Without the desktop bridge nothing can be
 * asked, so the page only says so, in the browser's language when the app has it.
 */
export async function startApp(
  element: HTMLElement,
  bridge: DesktopBridge | undefined,
  browserLanguage: string,
): Promise<Root> {
  const root = createRoot(element);
  if (!bridge) {
    const language =
      UI_LANGUAGES.find((supported) => browserLanguage.startsWith(supported)) ?? 'en';
    const i18n = await createI18n(language);
    document.documentElement.lang = language;
    root.render(<NoDesktopPage i18n={i18n} />);
    return root;
  }
  const api = createDesktopApi(bridge);

  // Without the settings the window still opens, in English, and shows what failed where it matters.
  const language = (await api.getSettings().catch(() => undefined))?.language ?? 'en';
  const i18n = await createI18n(language);
  document.documentElement.lang = language;
  i18n.on('languageChanged', (changed) => {
    document.documentElement.lang = changed;
  });

  root.render(
    <StrictMode>
      <App api={api} i18n={i18n} />
    </StrictMode>,
  );
  return root;
}
