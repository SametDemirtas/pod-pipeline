import { vi } from 'vitest';
import {
  AI_PROVIDERS,
  type ConnectionsDto,
  type DesktopApi,
  type SignInService,
} from '@pod/contracts/client';
import type { FakeState } from './fake-state.js';

/** What each browser sign-in connects in the fake. */
const SIGNED_IN: Readonly<Record<SignInService, Partial<ConnectionsDto>>> = {
  etsy: { etsy: { shopName: 'ExampleShop' } },
  pinterest: { pinterest: { username: 'example-pins' } },
};

/** Connections to the outside services. */
export function fakeConnectionsApi(state: FakeState) {
  const connectTo = (change: Partial<ConnectionsDto>) => {
    state.connections = { ...state.connections, ...change };
    return Promise.resolve(state.connections);
  };
  return {
    getConnections: vi.fn(() => Promise.resolve(state.connections)),
    connectPrintful: vi.fn<DesktopApi['connectPrintful']>(() =>
      connectTo({ printful: { storeName: 'Example Store' } }),
    ),
    startDropbox: vi.fn<DesktopApi['startDropbox']>(() =>
      Promise.resolve({ authorizeUrl: 'https://www.dropbox.com/oauth2/authorize?client_id=k' }),
    ),
    finishDropbox: vi.fn<DesktopApi['finishDropbox']>(() => connectTo({ fileHost: 'dropbox' })),
    connectS3: vi.fn<DesktopApi['connectS3']>(() => connectTo({ fileHost: 's3' })),
    connectSignIn: vi.fn<DesktopApi['connectSignIn']>(({ service }) =>
      connectTo(SIGNED_IN[service]),
    ),
    cancelSignIn: vi.fn<DesktopApi['cancelSignIn']>(() => Promise.resolve(state.connections)),
    connectAi: vi.fn<DesktopApi['connectAi']>(({ provider }) =>
      connectTo({ ai: { ...state.connections.ai, [provider]: true } }),
    ),
    disconnect: vi.fn<DesktopApi['disconnect']>(({ service }) =>
      connectTo(
        AI_PROVIDERS.some((provider) => provider === service)
          ? { ai: { ...state.connections.ai, [service]: false } }
          : { [service]: null },
      ),
    ),
  };
}
