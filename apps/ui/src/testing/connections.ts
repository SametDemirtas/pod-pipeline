import { screen, within } from '@testing-library/react';
import type { renderApp } from './render-app.js';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

/** Answers yes when asked whether to disconnect a service. */
export async function confirmDisconnect(user: User) {
  const ask = await screen.findByRole('alertdialog', { name: 'Disconnect this service?' });
  await user.click(within(ask).getByRole('button', { name: 'Disconnect' }));
}
