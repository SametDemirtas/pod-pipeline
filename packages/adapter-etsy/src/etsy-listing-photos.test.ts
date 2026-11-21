import { describe, expect, it } from 'vitest';
import { EtsyListingPhotos } from './etsy-listing-photos.js';
import { clientWith } from './testing/fake-fetch.js';
import { path } from './testing/listings.js';

function image(rank: number | undefined, extra: Record<string, unknown> = {}) {
  return {
    listing_image_id: 500 + (rank ?? 99),
    rank,
    url_570xN: `https://i.etsystatic.com/${rank}/570.jpg`,
    url_fullxfull: `https://i.etsystatic.com/${rank}/full.jpg`,
    full_width: 2000,
    full_height: 1600,
    ...extra,
  };
}

describe('EtsyListingPhotos', () => {
  it('reads the photos the listing shows, main photo first', async () => {
    const { client, calls } = clientWith({
      body: { count: 3, results: [image(2), image(undefined), image(1, { full_width: 0 })] },
    });

    const photos = await new EtsyListingPhotos(client).photos('9');

    expect(calls().map(path)).toEqual(['/listings/9/images']);
    expect(photos).toEqual([
      {
        url: 'https://i.etsystatic.com/1/full.jpg',
        thumbnailUrl: 'https://i.etsystatic.com/1/570.jpg',
        width: null,
        height: 1600,
      },
      {
        url: 'https://i.etsystatic.com/2/full.jpg',
        thumbnailUrl: 'https://i.etsystatic.com/2/570.jpg',
        width: 2000,
        height: 1600,
      },
      {
        url: 'https://i.etsystatic.com/undefined/full.jpg',
        thumbnailUrl: 'https://i.etsystatic.com/undefined/570.jpg',
        width: 2000,
        height: 1600,
      },
    ]);
  });

  it('reads no photos from a listing without any', async () => {
    const { client } = clientWith({ body: { count: 0, results: [] } });

    expect(await new EtsyListingPhotos(client).photos('9')).toEqual([]);
  });
});
