import type { UiLanguage } from '@pod/contracts';
import { escapeHtml } from '../shared/escape-html.js';

/** Closing faster than this needs no notice. */
const CLOSING_NOTICE_DELAY_MS = 1000;

const TEXTS: Readonly<Record<UiLanguage, { title: string; body: string }>> = {
  en: {
    title: 'Finishing work…',
    body: 'POD Pipeline closes once the work under way is saved.',
  },
  tr: {
    title: 'İşler bitiriliyor…',
    body: 'POD Pipeline, süren işler kaydedilince kapanır.',
  },
  de: {
    title: 'Arbeit wird abgeschlossen…',
    body: 'POD Pipeline schließt, sobald die laufende Arbeit gespeichert ist.',
  },
};

/** The notice's page, in the seller's language, with no script. */
export function closingPage(language: UiLanguage): string {
  const { title, body } = TEXTS[language];
  return (
    `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    '<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222;background:#fff}' +
    '@media (prefers-color-scheme:dark){body{color:#eee;background:#222}}</style></head>' +
    `<body><p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(body)}</p></body></html>`
  );
}

/** A window the notice is shown in, as far as the notice needs it. */
export interface NoticeWindow {
  close(): void;
}

/**
 * Shows the notice with `open` once closing takes longer than `delayMs`.
 * Returns a function that takes it away, or keeps it from showing. A notice
 * that cannot be shown is logged; closing goes on without it.
 */
export function showClosingNotice(
  open: () => NoticeWindow,
  logError: (error: unknown) => void,
  delayMs = CLOSING_NOTICE_DELAY_MS,
): () => void {
  let window: NoticeWindow | undefined;
  const timer = setTimeout(() => {
    try {
      window = open();
    } catch (error) {
      logError(error);
    }
  }, delayMs);
  return () => {
    clearTimeout(timer);
    window?.close();
  };
}
