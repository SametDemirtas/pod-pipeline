import { shell } from 'electron';
import { isHttpsUrl } from '../shared/https-url.js';

/** Only web pages leave the app; anything else could launch a local program. */
export async function openInBrowser(url: string): Promise<void> {
  if (!isHttpsUrl(url)) {
    throw new Error(`Not opening ${url}`);
  }
  await shell.openExternal(url);
}
