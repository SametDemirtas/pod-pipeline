import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { DATA_DIRECTORY_VARIABLE } from '@pod/contracts';
import { FAKE_SERVICES_VARIABLE } from '../src/main/composition/fake-service-route.js';

export interface LaunchedApp {
  readonly app: ElectronApplication;
  readonly window: Page;
  readonly dataDirectory: string;
  /** Makes the next open dialog return `path` instead of opening. */
  readonly answerOpenDialog: (path: string) => Promise<void>;
  /** Quits the app and keeps its data folder for inspection. */
  readonly quit: () => Promise<void>;
  /** Quits the app and deletes its data; safe to call more than once. */
  readonly close: () => Promise<void>;
}

export interface LaunchOptions {
  /** A data folder to start with, e.g. one an earlier launch left; a new one otherwise. */
  readonly dataDirectory?: string;
  /** The address of fake services the app sends its requests to instead of the real ones. */
  readonly fakeServicesUrl?: string;
}

/** Calls the app over its preload bridge as the window does, and resolves with its raw result. */
export function callApp(page: Page, channel: string, request?: unknown): Promise<unknown> {
  return page.evaluate(
    ([name, body]) =>
      (
        window as unknown as {
          pod: { invoke: (channel: string, request: unknown) => Promise<unknown> };
        }
      ).pod.invoke(name, body),
    [channel, request] as const,
  );
}

/** Removes a folder, retrying while Windows still holds files the app just closed. */
export function removeFolder(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** Starts the built app with its own data folder and an English interface. */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const dataDirectory = options.dataDirectory ?? newDataDirectory();
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [join(import.meta.dirname, '../out/main/index.js')],
      env: appEnvironment(dataDirectory, options.fakeServicesUrl),
    });
    const window = await app.firstWindow();
    return launched(app, window, dataDirectory);
  } catch (error) {
    await app?.close();
    if (!options.dataDirectory) removeFolder(dataDirectory);
    throw error;
  }
}

/** Variables of the test's own shell that would change how the app starts. */
const NOT_INHERITED = new Set([
  FAKE_SERVICES_VARIABLE,
  'ELECTRON_RENDERER_URL',
  'ELECTRON_RUN_AS_NODE',
]);

/** The test's own environment, with the app's data folder and only the fake services asked for. */
function appEnvironment(
  dataDirectory: string,
  fakeServicesUrl: string | undefined,
): Record<string, string> {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !NOT_INHERITED.has(entry[0]),
  );
  return {
    ...Object.fromEntries(inherited),
    [DATA_DIRECTORY_VARIABLE]: dataDirectory,
    ...(fakeServicesUrl ? { [FAKE_SERVICES_VARIABLE]: fakeServicesUrl } : {}),
  };
}

function newDataDirectory(): string {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'pod-e2e-'));
  writeFileSync(join(dataDirectory, 'settings.json'), JSON.stringify({ language: 'en' }));
  return dataDirectory;
}

function launched(app: ElectronApplication, window: Page, dataDirectory: string): LaunchedApp {
  let running = true;
  const quit = async () => {
    if (!running) return;
    running = false;
    await app.close();
  };
  return {
    app,
    window,
    dataDirectory,
    answerOpenDialog: (path) =>
      app.evaluate(({ dialog }, chosen) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [chosen] });
      }, path),
    quit,
    close: async () => {
      try {
        await quit();
      } finally {
        removeFolder(dataDirectory);
      }
    },
  };
}
