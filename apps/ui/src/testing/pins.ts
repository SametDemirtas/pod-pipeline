import { screen, within } from '@testing-library/react';
import { createFakeApi, designDto } from './fake-api.js';

/** A time the pins are not yet due at, whenever the tests run. */
export const TOMORROW = new Date(Date.now() + 86_400_000).toISOString();

/** A fake API whose mug has Printful photos, with Pinterest connected unless asked not to. */
export async function withPhotos(pinterest = true) {
  const fake = createFakeApi([designDto('01-mug', 'Lantern Harbor')]);
  await fake.api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
  if (pinterest) await fake.api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
  return fake;
}

/** The design's list of pins, once it shows. */
export const pinsList = () => within(screen.getByRole('list', { name: 'Pins' }));
export const findPins = async () => within(await screen.findByRole('list', { name: 'Pins' }));
