/** Name of the app's data folder inside the operating system's application data folder. */
export const APP_DATA_FOLDER_NAME = 'POD Pipeline';

/** Environment variable that moves the data folder, for tests and portable setups. */
export const DATA_DIRECTORY_VARIABLE = 'POD_DATA_DIR';

/** File in the data folder that tells local tools how to reach the running app. */
export const LOCAL_API_CONNECTION_FILE = 'local-api.json';

/** Raised whenever the local API changes incompatibly. */
export const LOCAL_API_VERSION = 2;

/** Contents of {@link LOCAL_API_CONNECTION_FILE}. */
export interface LocalApiConnection {
  readonly apiVersion: number;
  readonly url: string;
  readonly token: string;
}

/** Path of the local API operation `name`, e.g. `/api/listDesigns`. */
export function localApiPath(name: string): string {
  return `/api/${name}`;
}
