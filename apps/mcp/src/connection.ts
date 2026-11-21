import { readFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import {
  APP_DATA_FOLDER_NAME,
  DATA_DIRECTORY_VARIABLE,
  LOCAL_API_CONNECTION_FILE,
  LOCAL_API_VERSION,
  type LocalApiConnection,
} from '@pod/contracts/client';

/** The desktop app is closed, so there is nothing to talk to. */
export class AppNotRunningError extends Error {
  constructor() {
    super('POD Pipeline is not running. Open the app, then try again.');
    this.name = 'AppNotRunningError';
  }
}

/** The running app speaks another version of the local API. */
export class AppVersionMismatchError extends Error {
  constructor(found: unknown) {
    super(
      `POD Pipeline uses local API version ${String(found)}, but this MCP server expects ` +
        `${LOCAL_API_VERSION}. Update the app and the MCP server to the same release.`,
    );
    this.name = 'AppVersionMismatchError';
  }
}

export interface Environment {
  readonly platform: NodeJS.Platform;
  readonly home: string;
  readonly variables: Readonly<Record<string, string | undefined>>;
}

/** Where the desktop app keeps its data, mirroring Electron's `userData` folder. */
export function dataDirectory({ platform, home, variables }: Environment): string {
  const override = variables[DATA_DIRECTORY_VARIABLE];
  if (override) return override;
  if (platform === 'win32') {
    const appData = variables['APPDATA'] || win32.join(home, 'AppData', 'Roaming');
    return win32.join(appData, APP_DATA_FOLDER_NAME);
  }
  if (platform === 'darwin') {
    return posix.join(home, 'Library', 'Application Support', APP_DATA_FOLDER_NAME);
  }
  const config = variables['XDG_CONFIG_HOME'] || posix.join(home, '.config');
  return posix.join(config, APP_DATA_FOLDER_NAME);
}

const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

/** Reads the details the running app publishes; fails if the app is closed or incompatible. */
export async function readConnection(directory: string): Promise<LocalApiConnection> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(directory, LOCAL_API_CONNECTION_FILE), 'utf8'));
  } catch {
    throw new AppNotRunningError();
  }
  if (typeof parsed !== 'object' || parsed === null) throw new AppNotRunningError();
  const { apiVersion, url, token } = parsed as Record<string, unknown>;
  if (typeof url !== 'string' || !LOOPBACK_URL.test(url) || typeof token !== 'string' || !token) {
    throw new AppNotRunningError();
  }
  if (apiVersion !== LOCAL_API_VERSION) throw new AppVersionMismatchError(apiVersion);
  return { apiVersion, url, token };
}
