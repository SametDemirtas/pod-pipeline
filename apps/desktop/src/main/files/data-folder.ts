import { join } from 'node:path';

/** What the app keeps in its data folder, by file or folder name. */
const DATA_FILES = {
  database: 'catalog.db',
  assets: 'assets',
  secrets: 'secrets.json',
  settings: 'settings.json',
  thumbnails: 'thumbnails',
  /** Downloads wait here until they are stored; leftovers are swept at start-up. */
  downloads: 'downloads',
} as const;

export type DataFile = keyof typeof DATA_FILES;

/** Where one of the app's files or folders lives in the data folder. */
export function dataPath(dataDirectory: string, file: DataFile): string {
  return join(dataDirectory, DATA_FILES[file]);
}

/** Folders the fetch script fills, by `process.platform`. */
const PLATFORM_FOLDERS: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  darwin: 'mac',
  win32: 'win',
  linux: 'linux',
};

export interface UpscalerLocation {
  readonly packaged: boolean;
  /** Where packaged resources live; `process.resourcesPath` in the app. */
  readonly resourcesPath: string;
  /** The desktop app's folder in a development checkout. */
  readonly appPath: string;
  readonly platform: NodeJS.Platform;
}

/** The folder holding the upscaling engine and its `models` folder, packaged or fetched in a checkout. */
export function upscalerDirectory(location: UpscalerLocation): string {
  return location.packaged
    ? join(location.resourcesPath, 'upscaler')
    : join(location.appPath, 'resources', 'upscaler', PLATFORM_FOLDERS[location.platform] ?? '');
}
