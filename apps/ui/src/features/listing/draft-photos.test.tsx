import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, listingDto } from '../../testing/fake-api.js';
import { mockupDto } from '../../testing/dtos/catalog-dtos.js';
import { mug } from '../../testing/print.js';
import { renderApp } from '../../testing/render-app.js';

/** A mug with a draft on Etsy, two Printful photos, a scene and a photo of older artwork. */
function draftWithPhotos() {
  const fake = createFakeApi([mug()]);
  fake.api.getListing.mockResolvedValue(listingDto());
  fake.api.replaceListingPhotos.mockResolvedValue(listingDto());
  fake.api.listMockups.mockResolvedValue([
    mockupDto('m-flat', 'default'),
    mockupDto('m-couch', 'Couch'),
    { ...mockupDto('m-scene', 'default'), scenePrompt: 'On a sofa', printConfirmed: true },
    { ...mockupDto('m-old', 'Bed'), designRevision: 0 },
  ]);
  return fake;
}

const photos = () => within(screen.getByRole('group', { name: 'Photos' }));

describe("Etsy draft's photos", () => {
  it('replaces them with the chosen Printful photos once the seller confirms', async () => {
    const { api } = draftWithPhotos();
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByRole('heading', { name: 'Photos on Etsy' })).toBeInTheDocument();
    const boxes = photos().getAllByRole('checkbox');
    // Scenes and photos of earlier artwork are not offered.
    expect(boxes).toHaveLength(2);
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'true']);
    await user.click(boxes[0] as HTMLElement);
    await user.click(boxes[0] as HTMLElement);

    await user.click(screen.getByRole('button', { name: 'Update photos on Etsy' }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/Every photo of this draft on Etsy is removed/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(api.replaceListingPhotos).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Update photos on Etsy' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Replace photos',
      }),
    );

    expect(api.replaceListingPhotos).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      mockupIds: ['m-couch', 'm-flat'],
    });
    expect(await screen.findByText('The draft on Etsy has the new photos.')).toBeInTheDocument();
  });

  it('says why a listing that is no longer a draft keeps its photos', async () => {
    const { api } = draftWithPhotos();
    api.replaceListingPhotos.mockRejectedValueOnce(
      new ApiError({ code: 'LISTING_NOT_DRAFT', message: 'active', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Update photos on Etsy' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Replace photos',
      }),
    );

    expect(await screen.findByText(/no longer a draft on Etsy/)).toBeInTheDocument();
  });

  it('cannot update the photos without any chosen', async () => {
    const { api } = draftWithPhotos();
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await screen.findByRole('heading', { name: 'Photos on Etsy' });
    for (const box of photos().getAllByRole('checkbox')) await user.click(box);

    const update = screen.getByRole('button', { name: 'Update photos on Etsy' });
    expect(update).toHaveAttribute('aria-disabled', 'true');
    await user.click(update);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('leaves the photos of a published listing to Etsy', async () => {
    const { api } = draftWithPhotos();
    api.getListing.mockResolvedValue(listingDto({ state: 'active' }));
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('Published')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Photos on Etsy' })).not.toBeInTheDocument();
  });

  it('offers a retry when the mockups cannot be read', async () => {
    const { api } = draftWithPhotos();
    const stored = await api.listMockups({ id: 'id-01-mug' });
    api.listMockups.mockRejectedValue(new Error('offline'));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    // The mockups section above offers its own retry; the draft's photos say so too.
    expect(await screen.findByRole('heading', { name: 'Photos on Etsy' })).toBeInTheDocument();
    const retries = await screen.findAllByRole('button', { name: 'Try again' });
    expect(retries).toHaveLength(2);
    api.listMockups.mockResolvedValue(stored);
    await user.click(retries[1] as HTMLElement);

    expect(await photos().findAllByRole('checkbox')).toHaveLength(2);
  });
});
