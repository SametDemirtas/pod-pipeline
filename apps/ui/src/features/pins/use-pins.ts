import { useQuery } from '@tanstack/react-query';
import type { PinDto, PlanPinRequest, PublishPinNowRequest } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useCachedChange } from '../../shared/use-cached-change.js';

const usePinsApi = scopedApi<
  'approvePin' | 'listPins' | 'listBoards' | 'planPin' | 'publishPinNow' | 'removePin'
>();

/** Pins change in the background: planned ones go out, assistants propose new ones. */
const REFRESH_MS = 60_000;
const CHANGING: ReadonlySet<PinDto['state']> = new Set(['proposed', 'planned', 'publishing']);

export function usePins(designId: string) {
  const api = usePinsApi();
  return useQuery({
    queryKey: queryKeys.pins(designId),
    queryFn: () => api.listPins({ id: designId }),
    refetchInterval: (query) =>
      query.state.data?.some((pin) => CHANGING.has(pin.state)) ? REFRESH_MS : false,
  });
}

export function useBoards(enabled: boolean) {
  const api = usePinsApi();
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: () => api.listBoards(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Swaps one changed pin into the design's list; a list never read stays unread. */
function withPin(pins: readonly PinDto[] | undefined, changed: PinDto): PinDto[] | undefined {
  if (!pins) return undefined;
  const others = pins.filter((pin) => pin.id !== changed.id);
  return [...others, changed].sort((a, b) => a.publishAt.localeCompare(b.publishAt, 'en'));
}

export function usePlanPin(designId: string) {
  const api = usePinsApi();
  return useCachedChange<PlanPinRequest, PinDto, readonly PinDto[] | undefined>({
    queryKey: queryKeys.pins(designId),
    change: (request: PlanPinRequest) => api.planPin(request),
    toCache: (pin, pins) => withPin(pins, pin),
  });
}

/** Approving or publishing one pin, which comes back changed. */
function usePinChange<T>(designId: string, change: (input: T) => Promise<PinDto>) {
  return useCachedChange<T, PinDto, readonly PinDto[] | undefined>({
    queryKey: queryKeys.pins(designId),
    change,
    toCache: (pin, pins) => withPin(pins, pin),
    // The pin may have changed meanwhile, e.g. its outcome became unknown and needs confirming.
    onError: (queryClient) => queryClient.invalidateQueries({ queryKey: queryKeys.pins(designId) }),
  });
}

export function useApprovePin(designId: string) {
  const api = usePinsApi();
  return usePinChange(designId, (id: string) => api.approvePin({ id }));
}

export function usePublishPin(designId: string) {
  const api = usePinsApi();
  return usePinChange(designId, (request: PublishPinNowRequest) => api.publishPinNow(request));
}

/** `onRemoved` runs even though the removed pin's row is gone by then. */
export function useRemovePin(designId: string, onRemoved: () => void) {
  const api = usePinsApi();
  return useCachedChange({
    queryKey: queryKeys.pins(designId),
    change: (id: string) => api.removePin({ id }),
    afterSaved: onRemoved,
  });
}
