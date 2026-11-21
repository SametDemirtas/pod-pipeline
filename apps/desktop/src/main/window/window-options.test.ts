import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  chromeUserAgent,
  mainWindowOptions,
  pinComposerWindowOptions,
  researchWindowOptions,
} from './window-options.js';

const session = {} as Session;
const lockedDown = { contextIsolation: true, sandbox: true, nodeIntegration: false };

describe('window options', () => {
  it('lock every window down, with the preload only in the app window', () => {
    expect(mainWindowOptions('/preload.cjs').webPreferences).toMatchObject({
      ...lockedDown,
      preload: '/preload.cjs',
      webSecurity: true,
    });
    for (const options of [researchWindowOptions(session), pinComposerWindowOptions(session)]) {
      expect(options.webPreferences).toMatchObject({ ...lockedDown, session });
      expect(options.webPreferences).not.toHaveProperty('preload');
      expect(options.show).toBe(false);
    }
  });

  it('draw pins offscreen without scripts, at the pin size', () => {
    expect(pinComposerWindowOptions(session)).toMatchObject({
      width: 1000,
      height: 1500,
      useContentSize: true,
      webPreferences: { offscreen: true, javascript: false },
    });
  });

  it('name Chrome alone in the research user agent, for each system', () => {
    expect(chromeUserAgent('darwin', '140.0.1')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.1 Safari/537.36',
    );
    expect(chromeUserAgent('win32', '1')).toContain('(Windows NT 10.0; Win64; x64)');
    expect(chromeUserAgent('linux', '1')).toContain('(X11; Linux x86_64)');
  });
});
