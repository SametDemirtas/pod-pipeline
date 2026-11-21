import { useQueryClient } from '@tanstack/react-query';
import { useReducer } from 'react';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { INITIAL_IMPORT_STATE, importReducer } from './import-flow.js';
import { useImportProgress } from './use-import-progress.js';

const useImportFlowApi = scopedApi<'pickFolder' | 'previewImport' | 'runImport'>();

/** The import wizard's state and the API calls that move it from step to step. */
export function useImportFlow() {
  const api = useImportFlowApi();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(importReducer, INITIAL_IMPORT_STATE);
  const busy = state.step === 'checking' || state.step === 'importing';
  const progress = useImportProgress(busy);

  async function check(rootPath: string) {
    dispatch({ type: 'check', rootPath });
    try {
      dispatch({ type: 'checked', preview: await api.previewImport({ rootPath }) });
    } catch (error) {
      dispatch({ type: 'failed', error });
    }
  }

  async function chooseFolder() {
    let rootPath: string | null;
    try {
      rootPath = await api.pickFolder();
    } catch (error) {
      dispatch({ type: 'failed', error });
      return;
    }
    if (!rootPath) return;
    // Choosing a folder approves it for importing.
    void queryClient.invalidateQueries({ queryKey: queryKeys.importFolders });
    await check(rootPath);
  }

  async function confirm() {
    if (state.step !== 'review') return;
    const { rootPath, fingerprint } = state.preview;
    dispatch({ type: 'import' });
    try {
      dispatch({ type: 'imported', result: await api.runImport({ rootPath, fingerprint }) });
    } catch (error) {
      dispatch({ type: 'failed', error });
    }
  }

  return {
    state,
    busy,
    progress,
    check,
    chooseFolder,
    confirm,
    reset: () => {
      dispatch({ type: 'reset' });
    },
  };
}
