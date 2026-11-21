import { createContext, useContext, type ReactNode } from 'react';
import type { DesktopApi } from '@pod/contracts/client';

const ApiContext = createContext<DesktopApi | null>(null);

/** Supplies the API the UI talks to: the preload bridge in the app, a fake in tests. */
export function ApiProvider({ api, children }: { api: DesktopApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

function useApi(): DesktopApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('The API is only reachable inside an ApiProvider');
  return api;
}

/** Makes a hook that hands a feature only the calls it names, so it depends on no more of the API. */
export function scopedApi<K extends keyof DesktopApi>(): () => Pick<DesktopApi, K> {
  return useApi;
}
