import { describe, expect, it } from 'vitest';
import type { TemporaryFile } from '../ports/downloads.js';
import { storeTemporaryImage, type ImageStorage } from './store-image.js';

const storage: ImageStorage = {
  inspector: {
    inspect: (absolutePath) =>
      Promise.resolve(
        absolutePath.endsWith('.png')
          ? { mimeType: 'image/png', width: 10, height: 20 }
          : undefined,
      ),
  },
  assets: {
    put: () => Promise.resolve({ sha256: 'abc', storageKey: 'ab/abc', byteSize: 5 }),
  },
};

function temporary(absolutePath: string, dispose: () => Promise<void>) {
  const file: TemporaryFile & { disposed: number } = {
    absolutePath,
    disposed: 0,
    dispose: () => {
      file.disposed += 1;
      return dispose();
    },
  };
  return file;
}

const failingDispose = () => Promise.reject(new Error('file is locked'));

describe('storeTemporaryImage', () => {
  it('keeps the stored image when the temporary file cannot be removed', async () => {
    const file = temporary('/tmp/scene.png', failingDispose);

    await expect(storeTemporaryImage(storage, file, 'scene', 'the scene')).resolves.toMatchObject({
      storageKey: 'ab/abc',
      mimeType: 'image/png',
      width: 10,
    });
    expect(file.disposed).toBe(1);
  });

  it("reports the store's own error, not the failed removal", async () => {
    const file = temporary('/tmp/scene.txt', failingDispose);

    await expect(storeTemporaryImage(storage, file, 'scene', 'the scene')).rejects.toThrow(
      'the scene is not a PNG or JPEG image',
    );
    expect(file.disposed).toBe(1);
  });
});
