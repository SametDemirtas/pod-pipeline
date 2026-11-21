import { describe, expect, it } from 'vitest';
import { checkPrint } from './print-check.js';
import { printFileSize } from './print-file-size.js';

const blanket = (width: number, height: number) => ({
  placement: 'default',
  width,
  height,
  dpi: 150,
});

describe('printFileSize', () => {
  it('shrinks a large image to what the largest area needs, still printing good everywhere', () => {
    const image = { width: 10_240, height: 12_800 };
    const largest = blanket(9000, 12_000);
    const areas = [blanket(7500, 9000), largest];

    const size = printFileSize(image, areas, 'cover');

    expect(size).toEqual({ width: 9600, height: 12_000 });
    for (const area of areas) expect(checkPrint(size, area, 'cover').quality).toBe('good');
    expect(checkPrint({ width: 9599, height: 11_999 }, largest, 'cover').quality).not.toBe('good');
  });

  it('fits the whole image inside the area when it is contained', () => {
    const size = printFileSize({ width: 8000, height: 4000 }, [blanket(2000, 2000)], 'contain');

    expect(size).toEqual({ width: 2000, height: 1000 });
    expect(checkPrint(size, blanket(2000, 2000), 'contain').quality).toBe('good');
  });

  it('never makes the image larger, and keeps it whole without areas', () => {
    expect(printFileSize({ width: 1000, height: 1200 }, [blanket(9000, 12_000)], 'cover')).toEqual({
      width: 1000,
      height: 1200,
    });
    expect(printFileSize({ width: 1000, height: 1200 }, [], 'cover')).toEqual({
      width: 1000,
      height: 1200,
    });
  });

  it('adds the pixel rounding takes off', () => {
    const area = { placement: 'default', width: 1001, height: 1001, dpi: 300 };
    const size = printFileSize({ width: 3000, height: 3000 }, [area], 'cover');

    expect(checkPrint(size, area, 'cover').quality).toBe('good');
    expect(size.width).toBeLessThanOrEqual(1002);
  });
});
