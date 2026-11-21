import type { SettingsDto, UiLanguage } from '@pod/contracts';
import type { ErrorLogger } from '../api/to-api-error.js';

export interface ShutdownDeps {
  readonly settings: { get(): Promise<Pick<SettingsDto, 'language'>> };
  readonly defaultSettings: Pick<SettingsDto, 'language'>;
  /** Shows that the app is finishing its work; returns what takes the notice away. */
  readonly showNotice: (language: UiLanguage) => () => void;
  readonly log: ErrorLogger;
}

export interface Shutdown {
  /** Closes everything added, in order, once; later calls wait for the same closing. */
  readonly shutDown: () => Promise<void>;
  /** Whether closing began, after which no new work is taken. */
  readonly isClosing: () => boolean;
  /** Something to close, after what was added before it. */
  readonly add: (close: () => Promise<void>) => void;
}

/** Work under way may take minutes to finish, so a closing app says why it is still there. */
export function createShutdown(deps: ShutdownDeps): Shutdown {
  const parts: (() => Promise<void>)[] = [];
  let closing: Promise<void> | undefined;
  const closeAll = async () => {
    const { language } = await deps.settings.get().catch(() => deps.defaultSettings);
    const hideNotice = deps.showNotice(language);
    try {
      for (const close of parts) await close().catch(deps.log);
    } finally {
      hideNotice();
    }
  };
  return {
    shutDown: () => (closing ??= closeAll()),
    isClosing: () => closing !== undefined,
    add: (close) => {
      parts.push(close);
    },
  };
}

/** What start-up opens, each closed again on shutdown. */
export interface Serving {
  /** Everything start-up does before local tools may connect. */
  readonly prepare: () => Promise<void>;
  /** Opens the local API; resolves with what closes it and withdraws its connection file. */
  readonly openLocalAccess: () => Promise<() => Promise<void>>;
  /** What starts once local tools may connect, such as the window. */
  readonly start: () => void;
  readonly closeServices: () => Promise<void>;
}

/**
 * Starts serving, closing local access before the services on shutdown. A
 * start-up that fails half way closes what it opened, so assistants find no
 * connection file of an app that is not running.
 */
export async function serve(shutdown: Shutdown, serving: Serving): Promise<void> {
  let closeLocalAccess = (): Promise<void> => Promise.resolve();
  shutdown.add(() => closeLocalAccess());
  shutdown.add(serving.closeServices);
  try {
    await serving.prepare();
    closeLocalAccess = await serving.openLocalAccess();
    serving.start();
  } catch (error) {
    await shutdown.shutDown();
    throw error;
  }
}
