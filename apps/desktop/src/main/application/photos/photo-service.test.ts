import { describe, expect, it, vi } from 'vitest';
import type { DesignId } from '@pod/core';
import { InMemoryMockups } from '@pod/core/testing';
import { photo } from '../../testing/mockup-fixtures.js';
import { PhotoService } from './photo-service.js';

const MUG = 'design-01-mug' as DesignId;

describe('PhotoService', () => {
  it("removes a photo, announces it and answers with the design's others", async () => {
    const mockups = new InMemoryMockups();
    await mockups.replace(MUG, { variantId: '1320', printArea: 'default' }, [photo]);
    const catalogChanged = vi.fn();
    const save = vi.fn(() => Promise.resolve(true));
    const photos = new PhotoService({ mockups, saver: { save }, events: { catalogChanged } });

    await expect(photos.removeMockup({ designId: MUG, mockupId: photo.id })).resolves.toEqual([]);
    await expect(photos.savePhoto({ designId: MUG, mockupId: 'm2' })).resolves.toBe(true);

    expect(catalogChanged).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(MUG, 'm2');
  });
});
