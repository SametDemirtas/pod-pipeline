import { describe, expect, it } from 'vitest';
import type { Design } from '../catalog/model.js';
import type { MockupOrientationQuery } from '../ports/print-provider.js';
import { sampleDesign } from '../testing/contract/index.js';
import { uprightTarget } from './upright-target.js';

const LANDSCAPE = { placement: 'default', width: 9000, height: 7500, dpi: 150 };
const portrait = sampleDesign('01-blanket', {
  asset: { ...sampleDesign('01-blanket').asset, sha256: 'sha-portrait', width: 2560, height: 3200 },
});
const turned: Design = {
  ...portrait,
  revision: 2,
  asset: { ...portrait.asset, sha256: 'sha-turned', width: 3200, height: 2560 },
  rotation: { degrees: 90, originalSha256: 'sha-portrait', reason: 'Upright.' },
};
const query = { productId: '395', variantId: '10986', area: LANDSCAPE };

function support(answer: boolean) {
  const queries: MockupOrientationQuery[] = [];
  return {
    queries,
    supportsOrientation: (asked: MockupOrientationQuery) => {
      queries.push(asked);
      return Promise.resolve(answer);
    },
  };
}

describe('uprightTarget', () => {
  it('stands the area on end for portrait artwork that was never turned', async () => {
    const provider = support(true);

    const target = await uprightTarget(portrait, [portrait], query, provider);

    expect(target).toEqual({
      source: portrait,
      area: { placement: 'default', width: 7500, height: 9000, dpi: 150 },
      orientation: 'vertical',
    });
    expect(provider.queries).toEqual([
      { productId: '395', variantId: '10986', placement: 'default', orientation: 'vertical' },
    ]);
  });

  it('takes the revision from before the turn for turned artwork', async () => {
    const target = await uprightTarget(turned, [turned, portrait], query, support(true));

    expect(target?.source).toBe(portrait);
  });

  it('is unset when the provider refuses, cannot be asked, or the orientations match', async () => {
    expect(await uprightTarget(portrait, [portrait], query, support(false))).toBeUndefined();
    expect(await uprightTarget(portrait, [portrait], query, undefined)).toBeUndefined();
    expect(await uprightTarget(portrait, [portrait], query, {})).toBeUndefined();
    const provider = support(true);
    expect(await uprightTarget(turned, [turned], query, provider)).toBeUndefined();
    const wide = { ...portrait, asset: { ...portrait.asset, width: 3200, height: 2560 } };
    expect(await uprightTarget(wide, [wide], query, provider)).toBeUndefined();
    expect(provider.queries).toEqual([]);
  });
});
