import type {
  AiProvider,
  ConnectS3Request,
  ConnectSignInRequest,
  DisconnectRequest,
  SignInService,
} from '@pod/contracts/client';
import { scopedApi } from '../../../api/api-context.js';
import { useConnectionChange } from './use-connection-change.js';

const useDisconnectApi = scopedApi<'disconnect'>();
const useS3Api = scopedApi<'connectS3'>();
const useSignInApi = scopedApi<'connectSignIn' | 'cancelSignIn'>();
const usePrintfulApi = scopedApi<'connectPrintful'>();
const useAiApi = scopedApi<'connectAi'>();

/** The seller's own app on a service: its public id and its secret. */
interface AppKeys {
  readonly id: string;
  readonly secret: string;
}

/** How each service names the public id and the secret of the seller's app. */
const SIGN_IN_REQUEST: {
  readonly [S in SignInService]: (keys: AppKeys) => ConnectSignInRequest;
} = {
  etsy: ({ id, secret }) => ({ service: 'etsy', keystring: id, sharedSecret: secret }),
  pinterest: ({ id, secret }) => ({ service: 'pinterest', appId: id, appSecret: secret }),
};

export function useDisconnect(service: DisconnectRequest['service']) {
  const api = useDisconnectApi();
  return useConnectionChange(() => api.disconnect({ service }));
}

export function useConnectS3() {
  const api = useS3Api();
  return useConnectionChange((fields: ConnectS3Request) => api.connectS3(fields));
}

/** Signs in to the service with the seller's app in the browser, or gives up waiting for it. */
export function useBrowserSignIn(service: SignInService) {
  const api = useSignInApi();
  return {
    connect: (keys: AppKeys) => api.connectSignIn(SIGN_IN_REQUEST[service](keys)),
    cancel: () => api.cancelSignIn({ service }),
  };
}

/** Saves a Printful store token. */
export function usePrintfulConnect() {
  const api = usePrintfulApi();
  return (token: string) => api.connectPrintful({ token });
}

/** Saves a key for the AI service. */
export function useAiConnect(provider: AiProvider) {
  const api = useAiApi();
  return (apiKey: string) => api.connectAi({ provider, apiKey });
}
