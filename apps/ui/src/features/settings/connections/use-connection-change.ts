import { useState } from 'react';
import type { ConnectionsDto } from '@pod/contracts/client';
import { queryKeys } from '../../../api/query-keys.js';
import { useCachedChange } from '../../../shared/use-cached-change.js';

/**
 * A change to the connections whose result replaces the cached state. A key
 * lets other parts of the window see the change while it is under way.
 */
export function useConnectionChange<T>(
  change: (input: T) => Promise<ConnectionsDto>,
  mutationKey?: readonly unknown[],
) {
  return useCachedChange({
    queryKey: queryKeys.connections,
    mutationKey,
    change,
    // Print checks, mockups, the shop settings and the boards depend on the connections.
    afterSaved: (_connections, queryClient) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.printChecks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allMockups }),
        queryClient.invalidateQueries({ queryKey: queryKeys.shopOptions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.boards }),
      ]),
  });
}

/** True from the moment a service becomes connected while the settings are open. */
export function useJustConnected(connected: boolean): boolean {
  const [previous, setPrevious] = useState(connected);
  const [justConnected, setJustConnected] = useState(false);
  if (connected !== previous) {
    setPrevious(connected);
    setJustConnected(connected);
  }
  return justConnected;
}
