import { describe, expect, it } from 'vitest';
import { isFitMode, placeImage } from './placement.js';

const mugArea = { width: 2700, height: 1050 };

describe('placeImage', () => {
  it('fits a narrower image inside the area and centres it horizontally', () => {
    expect(placeImage({ width: 3840, height: 1648 }, mugArea, 'contain')).toEqual({
      left: 127,
      top: 0,
      width: 2447,
      height: 1050,
    });
  });

  it('fills the area with a narrower image and crops top and bottom', () => {
    expect(placeImage({ width: 3840, height: 1648 }, mugArea, 'cover')).toEqual({
      left: 0,
      top: -54,
      width: 2700,
      height: 1159,
    });
  });

  it('scales a small image up', () => {
    expect(placeImage({ width: 540, height: 210 }, mugArea, 'contain')).toEqual({
      left: 0,
      top: 0,
      width: 2700,
      height: 1050,
    });
  });

  it('recognises fit modes', () => {
    expect(isFitMode('contain')).toBe(true);
    expect(isFitMode('cover')).toBe(true);
    expect(isFitMode('stretch')).toBe(false);
  });
});
