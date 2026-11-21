import type { MenuItemConstructorOptions } from 'electron';
import type { UiLanguage } from '@pod/contracts';

/** Electron names only its own role menus; this one is the app's, so the app names it. */
const VIEW_LABELS: Readonly<Record<UiLanguage, string>> = {
  en: 'View',
  tr: 'Görünüm',
  de: 'Darstellung',
};

/**
 * The menus of an installed app, which offer no developer tools or forced reloads:
 * the View menu keeps zoom and full screen only. On macOS the File menu gives
 * Cmd+W to close the window, as Mac apps do.
 */
export function packagedMenuTemplate(
  platform: NodeJS.Platform,
  language: UiLanguage,
): MenuItemConstructorOptions[] {
  const menus: MenuItemConstructorOptions[] = [
    { role: 'editMenu' },
    {
      label: VIEW_LABELS[language],
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  return platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'fileMenu' }, ...menus] : menus;
}
