import { screen, within } from '@testing-library/react';
import { createFakeApi, designDto } from './fake-api.js';
import { renderApp } from './render-app.js';

export const MAKE_FROM_FRONT = 'Make a scene from White Glossy Mug 11 oz · Front';

/** A fake API with the design's Printful photos and a Gemini key. */
export async function withPhotos(familyKey = '01-mug') {
  const { api } = createFakeApi([designDto(familyKey, 'Lantern Harbor')]);
  await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
  await api.createMockups({ designId: `id-${familyKey}`, fit: 'contain' });
  return api;
}

/** Renders the design and opens the scene dialog on its front photo. */
export async function openDialog(
  api: Awaited<ReturnType<typeof withPhotos>>,
  familyKey = '01-mug',
) {
  const view = await renderApp(api, `/designs/id-${familyKey}`);
  const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
  await view.user.click(gallery.getByRole('button', { name: MAKE_FROM_FRONT }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Make a scene' }));
  return { ...view, gallery, dialog };
}
