import { parseJson } from '@pod/core';
import { FileHostRequestError, waitOf } from './errors.js';

/**
 * HTTP headers carry ASCII only, so Dropbox wants every other character of
 * the JSON argument escaped as `\uXXXX`.
 */
export function dropboxApiArg(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** `path/conflict/file/..` becomes `path/conflict/file`. */
export async function dropboxError(response: Response): Promise<FileHostRequestError> {
  const body = parseJson(await response.text());
  const summary =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['error_summary']
      : undefined;
  const reason = typeof summary === 'string' ? summary.replace(/\/\.*$/, '') : undefined;
  return new FileHostRequestError('dropbox', response.status, reason, waitOf(response));
}

export function isNotFound(error: FileHostRequestError): boolean {
  return error.status === 409 && /^path(_lookup)?\/not_found/.test(error.reason ?? '');
}
