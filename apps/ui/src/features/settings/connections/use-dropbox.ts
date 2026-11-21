import { useMutation } from '@tanstack/react-query';
import { scopedApi } from '../../../api/api-context.js';
import { useConnectionChange } from './use-connection-change.js';

const useDropboxApi = scopedApi<'finishDropbox' | 'startDropbox'>();

/** Opens Dropbox's sign-in for the app key; Dropbox then shows a code to paste. */
export function useStartDropbox() {
  const api = useDropboxApi();
  return useMutation({ mutationFn: (appKey: string) => api.startDropbox({ appKey }) });
}

export function useFinishDropbox() {
  const api = useDropboxApi();
  return useConnectionChange((code: string) => api.finishDropbox({ code }));
}
