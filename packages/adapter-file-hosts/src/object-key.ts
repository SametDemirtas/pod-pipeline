import type { IdGenerator } from '@pod/core';

const OBJECT_PREFIX = 'pod-pipeline';

/**
 * A fresh folder per file. Privacy comes from the expiring link or presigned
 * signature; the random folder keeps uploads from colliding and from being
 * guessed on a bucket that is public by mistake, so `ids` must be random.
 */
export function objectKey(name: string, ids: IdGenerator): string {
  return `${OBJECT_PREFIX}/${ids.next()}/${name.replace(/[/\\]/g, '_')}`;
}
