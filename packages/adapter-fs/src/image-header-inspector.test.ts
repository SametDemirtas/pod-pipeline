import { mkdirSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImageTooLargeError } from '@pod/core';
import { ImageHeaderInspector } from './image-header-inspector.js';
import { useTempFolder } from './testing/temp-folder.js';
import { jpeg, jpegWithMetadata, png } from './testing/test-images.js';

const folder = useTempFolder('pod-fs-');

describe('ImageHeaderInspector', () => {
  const inspector = new ImageHeaderInspector();

  it('reads PNG and JPEG dimensions from the contents, not the extension', async () => {
    expect(await inspector.inspect(folder.write('a.png', png(3840, 2)))).toEqual({
      mimeType: 'image/png',
      width: 3840,
      height: 2,
    });
    expect(await inspector.inspect(folder.write('photo.png', jpeg(640, 480)))).toEqual({
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
    });
  });

  it.each([
    [6, 480, 640],
    [8, 480, 640],
    [1, 640, 480],
    [3, 640, 480],
  ])('applies EXIF orientation %d', async (orientation, width, height) => {
    expect(
      await inspector.inspect(folder.write('a.jpg', jpeg(640, 480, orientation))),
    ).toMatchObject({
      width,
      height,
    });
  });

  it('finds the frame of a JPEG behind large metadata', async () => {
    const file = folder.write('print.jpg', jpegWithMetadata(7950, 9450, 700_000));

    expect(await inspector.inspect(file)).toEqual({
      mimeType: 'image/jpeg',
      width: 7950,
      height: 9450,
    });
  });

  it('reads a large print JPEG in full, up to 256 MiB, and calls a larger one too large', async () => {
    const large = folder.write('large.jpg', jpegWithMetadata(7950, 9450, 700_000));
    truncateSync(large, 100 * 1024 * 1024);
    const huge = folder.write('huge.jpg', jpegWithMetadata(7950, 9450, 700_000));
    truncateSync(huge, 256 * 1024 * 1024 + 1);

    expect(await inspector.inspect(large)).toMatchObject({ width: 7950, height: 9450 });
    await expect(inspector.inspect(huge)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('returns undefined for files that are not supported images', async () => {
    expect(await inspector.inspect(folder.write('fake.png', 'not an image'))).toBeUndefined();
    expect(await inspector.inspect(folder.write('empty.png', ''))).toBeUndefined();
    expect(
      await inspector.inspect(
        folder.write('icon.gif', Buffer.from('GIF89a\x01\x00\x01\x00', 'binary')),
      ),
    ).toBeUndefined();
    expect(
      await inspector.inspect(folder.write('broken.jpg', Buffer.from('ffd8ffe2', 'hex'))),
    ).toBeUndefined();
  });

  it('reports files it cannot read instead of calling them non-images', async () => {
    await expect(inspector.inspect(join(folder.path, 'missing.png'))).rejects.toThrow(/ENOENT/);
    mkdirSync(join(folder.path, 'folder.png'));
    await expect(inspector.inspect(join(folder.path, 'folder.png'))).rejects.toThrow(/EISDIR/);
  });
});
