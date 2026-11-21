import { describe, expect, it } from 'vitest';
import { checkPrint, MIN_DPI } from './print-check.js';

const mug = { placement: 'default', width: 2700, height: 1050, dpi: 300 };

describe('checkPrint', () => {
  it('reports resolution, coverage and nothing cropped when the image fits inside', () => {
    expect(checkPrint({ width: 3840, height: 1648 }, mug, 'contain')).toEqual({
      fit: 'contain',
      placement: { left: 127, top: 0, width: 2447, height: 1050 },
      effectiveDpi: 470,
      quality: 'good',
      areaCovered: 0.906,
      imageCropped: 0,
    });
  });

  it('reports the cropped share when the image fills the area', () => {
    const check = checkPrint({ width: 3840, height: 1648 }, mug, 'cover');

    expect(check.areaCovered).toBe(1);
    expect(check.imageCropped).toBe(0.094);
    expect(check.effectiveDpi).toBe(426);
  });

  it.each([
    [2100, 300, 'good'],
    [2099, 299, 'acceptable'],
    [1050, MIN_DPI, 'acceptable'],
    [1049, 149, 'poor'],
  ] as const)('rates an image %i pixels wide (%i dpi) as %s', (width, dpi, quality) => {
    const check = checkPrint({ width, height: width / 2 }, mug, 'contain');

    expect(check.effectiveDpi).toBe(dpi);
    expect(check.quality).toBe(quality);
  });

  it('rates an image made to the size of a 150 dpi print area as sharp', () => {
    const poster = { placement: 'default', width: 2700, height: 3600, dpi: 150 };

    expect(checkPrint({ width: 2700, height: 3600 }, poster, 'contain')).toMatchObject({
      effectiveDpi: 150,
      quality: 'good',
    });
  });
});
