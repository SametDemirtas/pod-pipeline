import { retryAfterSeconds } from '@pod/adapter-http';

export type FileHostName = 'dropbox' | 's3';

/** How the app's settings name each host; R2 is the S3-compatible store most sellers use. */
export const FILE_HOST_LABELS = {
  dropbox: 'Dropbox',
  s3: 'Cloudflare R2 or S3',
} as const satisfies Record<FileHostName, string>;

/** The file host has no stored credentials; the user has to connect it in the settings. */
export class FileHostNotConnectedError extends Error {
  constructor(readonly host: FileHostName) {
    super(`${FILE_HOST_LABELS[host]} is not connected`);
    this.name = new.target.name;
  }
}

/** The file host refused a request, naming the status it answered with. */
export class FileHostRequestError extends Error {
  constructor(
    readonly host: FileHostName,
    readonly status: number,
    /** Machine-readable reason from the host, e.g. `path/conflict/file` or `NoSuchBucket`. */
    readonly reason: string | undefined,
    /** The wait a rate-limited or busy answer asked for. */
    readonly retryAfterSeconds?: number,
  ) {
    super(`${FILE_HOST_LABELS[host]} answered ${status}${reason ? ` (${reason})` : ''}`);
    this.name = new.target.name;
  }
}

/** The wait a host asked for in `Retry-After`; none without one. */
export function waitOf(response: Response): number | undefined {
  const seconds = retryAfterSeconds(response, 0);
  return seconds > 0 ? seconds : undefined;
}

/** The app refused to upload a file larger than the host takes in one upload. */
export class FileTooLargeToShareError extends Error {
  constructor(
    readonly host: FileHostName,
    readonly byteSize: number,
    readonly maxBytes: number,
  ) {
    super(
      `${FILE_HOST_LABELS[host]} takes files up to ${megabytes(maxBytes, Math.floor)} in one upload; this one is ${megabytes(byteSize, Math.ceil)}`,
    );
    this.name = new.target.name;
  }
}

/** Rounded down for a limit and up for a file, so a file just over the limit never reads as within it. */
function megabytes(bytes: number, round: (value: number) => number): string {
  return `${String(round(bytes / (1024 * 1024)))} MB`;
}

/** The file host answered, but not in the shape its documentation describes. */
export class FileHostUnexpectedResponseError extends Error {
  constructor(
    readonly host: FileHostName,
    what: string,
  ) {
    super(`Unexpected ${FILE_HOST_LABELS[host]} response: ${what}`);
    this.name = new.target.name;
  }
}
