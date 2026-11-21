import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { mainWindowOptions } from './window-options.js';

export interface MainWindowOptions {
  readonly preloadPath: string;
  /** Dev server URL in development; the built `index.html` otherwise. */
  readonly rendererUrl: string | undefined;
  readonly rendererFile: string;
  /** Opens links the page asks for in the browser, refusing anything that is not a web page. */
  readonly openExternal: (url: string) => Promise<void>;
  readonly log: (error: unknown) => void;
}

/** A page that crashes this often within a minute is left closed rather than reloaded forever. */
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 60_000;

/**
 * Opens the single app window with the renderer locked down: no Node access,
 * sandboxed preload, and no navigation away from the app.
 */
export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow(mainWindowOptions(options.preloadPath));

  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    options.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  // A crashed or killed page leaves an empty window; reloading gives the seller the app back.
  let reloads: number[] = [];
  window.webContents.on('render-process-gone', (_event, details) => {
    options.log(new Error(`The window's page stopped: ${details.reason}`));
    const now = Date.now();
    reloads = reloads.filter((time) => now - time < RELOAD_WINDOW_MS);
    if (details.reason === 'clean-exit' || reloads.length >= MAX_RELOADS) return;
    if (window.isDestroyed()) return;
    reloads.push(now);
    window.webContents.reload();
  });

  if (options.rendererUrl) void window.loadURL(options.rendererUrl);
  else void window.loadFile(options.rendererFile);
  return window;
}

export function rendererFile(mainDirectory: string): string {
  return join(mainDirectory, '../renderer/index.html');
}
