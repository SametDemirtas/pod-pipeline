import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

type QueryKey = readonly unknown[];

interface ChangeOptions<T, R> {
  /** The query whose data the answer replaces, or where the answer says it belongs; `null` for none. */
  readonly queryKey: QueryKey | ((answer: R) => QueryKey | null);
  readonly change: (input: T) => Promise<R>;
  /** Lets other parts of the window see the change while it is under way. */
  readonly mutationKey?: QueryKey | undefined;
  /** Runs once the cache holds the answer, e.g. to read queries that depend on it again. */
  readonly afterSaved?: ((answer: R, queryClient: QueryClient) => unknown) | undefined;
  readonly onError?: (queryClient: QueryClient) => unknown;
}

interface ConvertedChangeOptions<T, R, C> extends ChangeOptions<T, R> {
  /** What the cache holds after the answer, e.g. the list with one item swapped. */
  readonly toCache: (answer: R, cached: C | undefined) => C;
}

/** A change whose answer replaces the cached data, so the page shows it without asking again. */
export function useCachedChange<T, R>(options: ChangeOptions<T, R>): UseMutationResult<R, Error, T>;
export function useCachedChange<T, R, C>(
  options: ConvertedChangeOptions<T, R, C>,
): UseMutationResult<R, Error, T>;
export function useCachedChange<T, R, C>(
  options: ChangeOptions<T, R> & { readonly toCache?: (answer: R, cached: C | undefined) => C },
): UseMutationResult<R, Error, T> {
  const queryClient = useQueryClient();
  const { queryKey, change, mutationKey, toCache, afterSaved, onError } = options;
  return useMutation({
    ...(mutationKey && { mutationKey }),
    mutationFn: change,
    onSuccess: async (answer) => {
      const key = typeof queryKey === 'function' ? queryKey(answer) : queryKey;
      if (key === null) return;
      queryClient.setQueryData(key, (cached?: C) => (toCache ? toCache(answer, cached) : answer));
      await afterSaved?.(answer, queryClient);
    },
    ...(onError && { onError: () => onError(queryClient) }),
  });
}
