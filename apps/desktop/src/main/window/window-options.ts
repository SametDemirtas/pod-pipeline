import type { BrowserWindowConstructorOptions, Session } from 'electron';
import { PIN_HEIGHT, PIN_WIDTH } from '../pins/pin-template.js';

/** No page the app shows may reach Node or leave its sandbox. */
const LOCKED_DOWN = { contextIsolation: true, sandbox: true, nodeIntegration: false } as const;

/** The app window: only the sandboxed preload bridges the page to the app. */
export function mainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: { ...LOCKED_DOWN, preload: preloadPath, webSecurity: true, spellcheck: false },
  };
}

/** A hidden window for one Etsy search, in the market's own session and with no preload. */
export function researchWindowOptions(session: Session): BrowserWindowConstructorOptions {
  return {
    width: 1200,
    height: 860,
    show: false,
    title: 'Etsy',
    webPreferences: { ...LOCKED_DOWN, session, webSecurity: true },
  };
}

/** An offscreen window that draws one pin page, without scripts. */
export function pinComposerWindowOptions(session: Session): BrowserWindowConstructorOptions {
  return {
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    show: false,
    useContentSize: true,
    webPreferences: { ...LOCKED_DOWN, session, offscreen: true, javascript: false },
  };
}

/** Chrome's own user agent, without the app's and Electron's names. */
export function chromeUserAgent(platform: NodeJS.Platform, chromeVersion: string): string {
  const system =
    platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}
