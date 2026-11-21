import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, session as sessions } from 'electron';
import { PIN_HEIGHT, PIN_WIDTH } from '../pins/pin-template.js';
import { pinComposerWindowOptions } from './window-options.js';

const PAINT_TIMEOUT_MS = 10_000;

/**
 * An offscreen window may finish loading before it painted the page, so a
 * fresh frame is asked for and awaited, for a bounded time.
 */
function paintedPage(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const painted = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      window.webContents.removeListener('paint', painted);
      reject(new Error('The pin image was not drawn in time'));
    }, PAINT_TIMEOUT_MS);
    window.webContents.once('paint', painted);
    window.webContents.invalidate();
  });
}

/**
 * Renders a pin page in a hidden, offscreen window and captures it as PNG.
 * The window has no access to the app or the network beyond the page itself.
 */
export async function renderPinPng(html: string): Promise<Uint8Array> {
  // A file rather than a data: URL, which Chromium caps at 2 MB and a sharp photo exceeds.
  const folder = await mkdtemp(join(app.getPath('temp'), 'pin-'));
  let window: BrowserWindow | undefined;
  try {
    const page = join(folder, 'pin.html');
    await writeFile(page, html, { mode: 0o600 });
    window = offscreenWindow();
    await window.loadFile(page);
    await paintedPage(window);
    const image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: PIN_WIDTH,
      height: PIN_HEIGHT,
    });
    // Screens with more than one pixel per point capture larger; pins are always 1000 wide.
    const sized = image.getSize().width === PIN_WIDTH ? image : image.resize({ width: PIN_WIDTH });
    return sized.toPNG();
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await rm(folder, { recursive: true, force: true });
  }
}

/** No scripts, no other pages, and a session of its own that keeps nothing. */
function offscreenWindow(): BrowserWindow {
  const window = new BrowserWindow(
    pinComposerWindowOptions(sessions.fromPartition('pin-composer')),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  return window;
}
