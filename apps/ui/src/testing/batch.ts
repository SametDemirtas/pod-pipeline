import { screen, within } from '@testing-library/react';
import { createFakeApi, designDto } from './fake-api.js';

/** Mug designs named Concept 1, Concept 2 and so on. */
export function designs(count: number) {
  return Array.from({ length: count }, (_, index) =>
    designDto(`${String(index + 1).padStart(2, '0')}-mug`, `Concept ${String(index + 1)}`),
  );
}

/** A fake API with the designs and a Claude key, so runs may write text. */
export async function connectedApi(count = 3) {
  const fake = createFakeApi(designs(count));
  await fake.api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
  return fake;
}

/** The bar of the designs picked on the catalog page. */
export const toolbar = () => within(screen.getByRole('toolbar', { name: 'Selected designs' }));
