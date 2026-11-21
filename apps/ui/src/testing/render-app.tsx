import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopApi, UiLanguage } from '@pod/contracts/client';
import { App } from '../app/App.js';
import { createI18n } from '../i18n/i18n.js';

/**
 * Renders the whole app at `route` with a fake API and no request retries but
 * those a query asks for itself.
 * Pass `advanceTimers` when the test uses fake timers.
 */
export async function renderApp(
  api: DesktopApi,
  route = '/',
  language: UiLanguage = 'en',
  advanceTimers?: (milliseconds: number) => void,
) {
  window.location.hash = `#${route}`;
  const i18n = await createI18n(language);
  // Queries that retry on their own do so at once, so a test never waits out the app's back-off.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const user = userEvent.setup(advanceTimers ? { advanceTimers } : {});
  const view = render(<App api={api} i18n={i18n} queryClient={queryClient} />);
  return { ...view, user, i18n, queryClient };
}
