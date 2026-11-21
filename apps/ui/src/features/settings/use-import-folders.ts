import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useCachedChange } from '../../shared/use-cached-change.js';

const useImportFoldersApi = scopedApi<'listImportFolders' | 'removeImportFolder'>();

export function useImportFolders() {
  const api = useImportFoldersApi();
  return useQuery({ queryKey: queryKeys.importFolders, queryFn: () => api.listImportFolders() });
}

export function useRemoveImportFolder() {
  const api = useImportFoldersApi();
  return useCachedChange({
    queryKey: queryKeys.importFolders,
    change: (folder: string) => api.removeImportFolder({ folder }),
  });
}
