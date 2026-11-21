import { BrowserWindow, session as sessions, type Session } from 'electron';
import type { Market } from '@pod/core';
import { openInBrowser } from './open-in-browser.js';
import { chromeUserAgent, researchWindowOptions } from './window-options.js';

/** Its own JavaScript world, so the page's scripts cannot change what ours read. */
const ISOLATED_WORLD = 999;

const lockedDown = new WeakSet<Session>();

/** How Etsy is spoken to in one market, and where the window may go. */
export interface ResearchSite {
  /** Sent with every request, so Etsy answers in the market's language. */
  readonly acceptLanguage: string;
  /** Etsy without signing in, or Etsy's human check. */
  readonly isAllowedUrl: (url: string) => boolean;
  /** An Etsy page the window may read. */
  readonly isEtsyPage: (url: string) => boolean;
}

/** The hidden window a search drives. */
interface ResearchPage {
  load(url: string): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  show(): void;
  isClosed(): boolean;
  close(): void;
}

/**
 * Kept apart from the app and from the seller's own browser, and one per
 * market, so the language Etsy remembers for one never carries over to
 * another. Etsy picks the currency from where the seller is; the report warns
 * when it is not the market's.
 */
function marketSession(market: Market, acceptLanguage: string): Session {
  const session = sessions.fromPartition(`persist:etsy-research-${market.region.toLowerCase()}`);
  if (!lockedDown.has(session)) {
    lockedDown.add(session);
    lockDown(session);
    session.setUserAgent(
      chromeUserAgent(process.platform, process.versions.chrome),
      acceptLanguage,
    );
  }
  return session;
}

/** Grants the page nothing: no permissions, no downloads. */
function lockDown(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, decide) => {
    decide(false);
  });
  session.setPermissionCheckHandler(() => false);
  session.on('will-download', (event) => {
    event.preventDefault();
  });
}

/**
 * A hidden Chromium window for one Etsy search. It runs Etsy's own scripts like
 * any browser but cannot reach the app, stays on Etsy and its human check,
 * keeps the seller signed out, and only opens when Etsy asks for a person.
 */
export function openResearchWindow(market: Market, site: ResearchSite): ResearchPage {
  const session = marketSession(market, site.acceptLanguage);
  const window = new BrowserWindow(researchWindowOptions(session));
  const contents = window.webContents;
  // Only a link the seller clicks on Etsy, while the window is showing, opens in their browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (window.isVisible() && site.isEtsyPage(url)) void openInBrowser(url).catch(() => undefined);
    return { action: 'deny' };
  });
  const stayOnEtsy = (event: { preventDefault: () => void }, url: string) => {
    if (!site.isAllowedUrl(url)) event.preventDefault();
  };
  contents.on('will-navigate', stayOnEtsy);
  contents.on('will-redirect', stayOnEtsy);

  return {
    load: (url) =>
      // Etsy's check reloads the page while loading, which aborts the first load.
      window.loadURL(url).catch((error: unknown) => {
        if (!(error instanceof Error && error.message.includes('ERR_ABORTED'))) throw error;
      }),
    evaluate: async <T>(script: string) => {
      if (!site.isEtsyPage(contents.getURL())) throw new Error('The research window left Etsy');
      const [result] = (await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [
        { code: script },
      ])) as unknown[];
      return result as T;
    },
    isClosed: () => window.isDestroyed(),
    show: () => {
      window.show();
      window.focus();
    },
    close: () => {
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
