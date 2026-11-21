import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_REFERENCE_IMAGE_BYTES } from '@pod/contracts';
import type { ImageInfo } from '@pod/core';
import { ReferenceImages } from './reference-images.js';

/** What the inspector reports for the files the tests use, by path; others are no image. */
const IMAGES: Readonly<Record<string, ImageInfo>> = {
  '/photos/cafe.jpg': { mimeType: 'image/jpeg', width: 40, height: 30 },
  '/photos/wide.png': { mimeType: 'image/png', width: 8001, height: 1 },
};
const DROPPED = '/tmp/dropped.download';

let files: Map<string, Uint8Array>;
let disposed: string[];
let picked: string | null;
let references: ReferenceImages;

beforeEach(() => {
  files = new Map();
  disposed = [];
  picked = null;
  references = new ReferenceImages({
    pickFile: () => Promise.resolve(picked),
    writeDropped: (base64) => {
      files.set(DROPPED, Buffer.from(base64, 'base64'));
      return Promise.resolve({
        absolutePath: DROPPED,
        dispose: () => {
          files.delete(DROPPED);
          disposed.push(DROPPED);
          return Promise.resolve();
        },
      });
    },
    readFile: (path, maxBytes) => {
      const bytes = files.get(path);
      if (!bytes) return Promise.reject(new Error(`no file at ${path}`));
      return Promise.resolve(bytes.length > maxBytes ? null : bytes);
    },
    inspector: {
      // A dropped file's first byte says what it is in these tests.
      inspect: (path) =>
        Promise.resolve(
          path === DROPPED
            ? files.get(path)?.[0] === 0x89
              ? { mimeType: 'image/png', width: 20, height: 20 }
              : undefined
            : IMAGES[path],
        ),
    },
  });
});

function pick(path: string, bytes: Uint8Array): void {
  picked = path;
  files.set(path, bytes);
}

describe('ReferenceImages', () => {
  it('reads the photo the seller picks', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    pick('/photos/cafe.jpg', bytes);

    expect(await references.take(undefined)).toEqual({ data: bytes, mimeType: 'image/jpeg' });
  });

  it('is null when the seller cancels the picker', async () => {
    expect(await references.take(undefined)).toBeNull();
  });

  it('checks a dropped photo on disk and removes it again', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const image = await references.take(bytes.toString('base64'));

    expect(image).toEqual({ data: bytes, mimeType: 'image/png' });
    expect(disposed).toEqual([DROPPED]);
    await expect(references.take(Buffer.from('not an image').toString('base64'))).rejects.toThrow(
      'notAnImage',
    );
    expect(disposed).toEqual([DROPPED, DROPPED]);
    expect(files.has(DROPPED)).toBe(false);
  });

  it.each([
    ['a file that is not an image', '/photos/notes.png', 1, 'notAnImage'],
    ['a file over the size limit', '/photos/cafe.jpg', MAX_REFERENCE_IMAGE_BYTES + 1, 'tooLarge'],
    ['an image wider than Claude reads', '/photos/wide.png', 1, 'tooLarge'],
  ])('refuses %s', async (_case, path, size, reason) => {
    pick(path, new Uint8Array(size));

    await expect(references.take(undefined)).rejects.toMatchObject({
      code: 'REFERENCE_IMAGE_UNREADABLE',
      details: { reason },
    });
  });
});
