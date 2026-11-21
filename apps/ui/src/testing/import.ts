import { screen } from '@testing-library/react';
import type { createFakeApi } from './fake-api.js';
import { renderApp } from './render-app.js';

/** Renders the catalog and opens the import dialog. */
export async function openWizard(api: ReturnType<typeof createFakeApi>['api']) {
  const rendered = await renderApp(api);
  await rendered.user.click(await screen.findByRole('button', { name: 'Import designs' }));
  return rendered;
}
