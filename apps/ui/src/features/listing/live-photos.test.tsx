import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withMockups } from '../../testing/listing.js';
import { renderApp } from '../../testing/render-app.js';

async function withDraft() {
  const { api } = await withMockups();
  await api.createListing({
    designId: 'id-01-mug',
    fit: 'contain',
    language: 'en-US',
    title: 'T',
    description: 'D',
    tags: [],
    price: 1999,
    currency: 'USD',
    variantIds: ['1320'],
    mockupIds: ['m-front'],
    shippingProfileId: '316',
    readinessStateId: '151',
    productionPartnerIds: [],
  });
  return api;
}

describe('What Etsy and Printful have now', () => {
  it('reads them once while a reading is under way', async () => {
    const api = await withDraft();
    api.listingPhotos.mockReturnValue(new Promise(() => undefined));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const show = await screen.findByRole('button', { name: 'Show' });
    await user.click(show);
    await user.click(show);

    expect(api.listingPhotos).toHaveBeenCalledTimes(1);
  });

  it('shows the photos on Etsy in order and the pictures Printful keeps', async () => {
    const api = await withDraft();
    api.listingPhotos.mockResolvedValue({
      marketplace: [
        {
          url: 'https://etsy/1.jpg',
          image: 'data:image/jpeg;base64,AQ==',
          width: 2000,
          height: 2000,
        },
        { url: 'https://etsy/2.jpg', image: '', width: null, height: null },
      ],
      print: [{ kind: 'preview', url: 'https://pf/p.png', image: 'data:image/png;base64,AQ==' }],
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Show' }));

    expect(await screen.findByText('Etsy shows 2 photos, main photo first.')).toBeInTheDocument();
    expect(api.listingPhotos).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(screen.getByRole('img', { name: 'Photo 1 on Etsy' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,AQ==',
    );
    expect(screen.getByText('2000 × 2000 px')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Photo 2 on Etsy' })).toHaveAttribute(
      'href',
      'https://etsy/2.jpg',
    );
    expect(screen.getByText('Printful has 1 picture of the linked files.')).toBeInTheDocument();
    expect(screen.getByText('Printful preview')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Printful picture 1' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AQ==',
    );
    expect(screen.getByRole('button', { name: 'Read again' })).toBeInTheDocument();
  });

  it('says when Printful has not imported the listing yet', async () => {
    const api = await withDraft();
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Show' }));

    expect(
      await screen.findByText('Printful has not imported this listing yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Etsy shows 0 photos, main photo first.')).toBeInTheDocument();
  });
});
