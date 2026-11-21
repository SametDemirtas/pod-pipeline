import { BrowserWindow, nativeTheme } from 'electron';
import type { UiLanguage } from '@pod/contracts';
import { closingPage, type NoticeWindow } from './closing-notice.js';

/** A small window saying the app is finishing its work; it only goes away with the app. */
export function openClosingWindow(language: UiLanguage): NoticeWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 140,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    show: false,
    // Matches the page's own colours, so the window never flashes white in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#222222' : '#ffffff',
    title: 'POD Pipeline',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(closingPage(language))}`);
  return {
    close: () => {
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
