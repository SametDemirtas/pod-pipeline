import { useIsMutating, useMutationState } from '@tanstack/react-query';

/**
 * The latest run of the changes under `mutationKey`, also one started before
 * the page was left and opened again, and whether one runs now.
 */
export function useLatestMutation(mutationKey: readonly unknown[]) {
  const running = useIsMutating({ mutationKey }) > 0;
  const runs = useMutationState({ filters: { mutationKey }, select: (mutation) => mutation.state });
  const latest = runs.at(-1);
  return { running, latest, error: latest?.status === 'error' ? latest.error : null };
}
