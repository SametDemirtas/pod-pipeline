import { readFile } from 'node:fs/promises';
import { parseJson } from '@pod/core';

/**
 * The JSON in a file; `undefined` when the file is missing or not JSON. Any
 * other read error is thrown, so a locked file is never taken for an empty one.
 */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseJson(text);
}
