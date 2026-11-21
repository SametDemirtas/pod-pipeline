import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { HashRouter, Route, Routes } from 'react-router';
import type { DesktopApi } from '@pod/contracts/client';
import { ApiProvider } from '../api/api-context.js';
import { CatalogPage } from '../features/catalog/CatalogPage.js';
import { DesignPage } from '../features/design/DesignPage.js';
import { ResearchPage } from '../features/research/ResearchPage.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import { AppShell } from './AppShell.js';
import { AppTheme } from './AppTheme.js';

interface AppProps {
  readonly api: DesktopApi;
  readonly i18n: i18n;
  readonly queryClient?: QueryClient;
}

export function App({ api, i18n, queryClient }: AppProps) {
  // Requests go to the local app, so a failure will not fix itself by retrying.
  const [client] = useState(
    () => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  return (
    <ApiProvider api={api}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <AppTheme>
            <HashRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<CatalogPage />} />
                  <Route path="designs/:id" element={<DesignPage />} />
                  <Route path="research" element={<ResearchPage />} />
                  <Route path="research/:id" element={<ResearchPage />} />
                  <Route path="research/lists/:listId" element={<ResearchPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Routes>
            </HashRouter>
          </AppTheme>
        </QueryClientProvider>
      </I18nextProvider>
    </ApiProvider>
  );
}
