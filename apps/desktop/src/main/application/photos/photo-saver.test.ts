import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, type DesignId } from '@pod/core';
import { InMemoryMockups } from '@pod/core/testing';
import { photo } from '../../testing/mockup-fixtures.js';
import { fileNameOf, PhotoSaver } from './photo-saver.js';

const MUG = 'design-01-mug' as DesignId;

async function setUp(target: string | null) {
  const mockups = new InMemoryMockups();
  await mockups.replace(MUG, { variantId: '1320', printArea: 'default' }, [photo]);
  const pickSavePath = vi.fn<(fileName: string) => Promise<string | null>>(() =>
    Promise.resolve(target),
  );
  const copyFile = vi.fn<(from: string, to: string) => Promise<void>>(() => Promise.resolve());
  const saver = new PhotoSaver({
    mockups,
    pathOf: (key) => `/assets/${key}`,
    pickSavePath,
    copyFile,
  });
  return { saver, pickSavePath, copyFile };
}

describe('PhotoSaver', () => {
  it('copies the full-size file to the place the seller picks', async () => {
    const { saver, pickSavePath, copyFile } = await setUp('/Users/me/Desktop/mug.jpg');

    await expect(saver.save(MUG, photo.id)).resolves.toBe(true);

    expect(pickSavePath).toHaveBeenCalledWith(fileNameOf(photo.view, photo.asset));
    expect(copyFile).toHaveBeenCalledWith(
      `/assets/${photo.asset.storageKey}`,
      '/Users/me/Desktop/mug.jpg',
    );
  });

  it('copies nothing when the save dialog is cancelled', async () => {
    const { saver, copyFile } = await setUp(null);

    await expect(saver.save(MUG, photo.id)).resolves.toBe(false);
    expect(copyFile).not.toHaveBeenCalled();
  });

  it('refuses a photo the design does not have', async () => {
    const { saver, pickSavePath } = await setUp('/tmp/x.jpg');

    await expect(saver.save(MUG, 'missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(pickSavePath).not.toHaveBeenCalled();
  });
});

describe('fileNameOf', () => {
  it('names a photo after its view and the start of its hash', () => {
    expect(fileNameOf('Left Front', { sha256: 'abcdef0123', mimeType: 'image/jpeg' })).toBe(
      'left-front-abcdef01.jpg',
    );
    expect(fileNameOf('Scene', { sha256: '12345678ff', mimeType: 'image/png' })).toBe(
      'scene-12345678.png',
    );
  });

  it('falls back to "photo" for a view with no letters or digits', () => {
    expect(fileNameOf('···', { sha256: '00000000', mimeType: 'image/jpeg' })).toBe(
      'photo-00000000.jpg',
    );
  });
});
