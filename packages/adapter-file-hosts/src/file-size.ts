import { stat } from 'node:fs/promises';
import { FileTooLargeToShareError, type FileHostName } from './errors.js';

/** The size in bytes of the file at a path. */
export type FileSizeOf = (absolutePath: string) => Promise<number>;

export const sizeOnDisk: FileSizeOf = async (absolutePath) => (await stat(absolutePath)).size;

export interface UploadLimit {
  readonly host: FileHostName;
  readonly maxBytes: number;
}

/**
 * Reads a file to upload, refusing one larger than the host takes; with
 * `sizeOf` before reading it, so a huge file is never loaded into memory.
 */
export async function readForUpload(
  absolutePath: string,
  limit: UploadLimit,
  readFile: (absolutePath: string) => Promise<Uint8Array<ArrayBuffer>>,
  sizeOf: FileSizeOf | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  const refuseTooLarge = (bytes: number) => {
    if (bytes > limit.maxBytes)
      throw new FileTooLargeToShareError(limit.host, bytes, limit.maxBytes);
  };
  if (sizeOf) refuseTooLarge(await sizeOf(absolutePath));
  const body = await readFile(absolutePath);
  refuseTooLarge(body.byteLength);
  return body;
}
