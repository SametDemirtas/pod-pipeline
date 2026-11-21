import { screen, within } from '@testing-library/react';
import { createFakeApi } from './fake-api.js';
import { mug } from './print.js';
import type { renderApp } from './render-app.js';

/** A fake API whose mug design already has its Printful mockups. */
export async function withMockups() {
  const fake = createFakeApi([mug()]);
  await fake.api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
  return fake;
}

type User = Awaited<ReturnType<typeof renderApp>>['user'];

/** Fills what the draft needs beyond the defaults. */
export async function fillDraft(user: User) {
  const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
  await user.type(form.getByLabelText('Description'), 'A cosy mug for tulip lovers.');
  await user.type(form.getByLabelText('Price (USD)'), '19.99');
}

/** What the humanizer reports for text it left alone. */
export const humanizer = { fixed: 0, left: [] };
