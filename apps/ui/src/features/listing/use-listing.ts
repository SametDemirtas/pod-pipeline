import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateListingRequest, ListingDto } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { apiErrorCode } from '../../shared/api-error-code.js';
import { useCachedChange } from '../../shared/use-cached-change.js';

const useListingApi = scopedApi<
  | 'createListing'
  | 'getListing'
  | 'linkListing'
  | 'listingPhotos'
  | 'publishListing'
  | 'refreshListing'
  | 'replaceListingPhotos'
>();

export function useListing(designId: string) {
  const api = useListingApi();
  return useQuery({
    queryKey: queryKeys.listing(designId),
    queryFn: () => api.getListing({ id: designId }),
  });
}

/** A change to the design's listing whose result replaces the cached one. */
function useListingChange<T>(designId: string, change: (input: T) => Promise<ListingDto | null>) {
  return useCachedChange({
    queryKey: queryKeys.listing(designId),
    mutationKey: queryKeys.listingChange(designId),
    change,
  });
}

/** True while any change to the design's listing runs, also one started before. */
export function useListingBusy(designId: string): boolean {
  return useIsMutating({ mutationKey: queryKeys.listingChange(designId) }) > 0;
}

/** Links the draft to Printful; `again` repairs a link Printful lost, even for the current revision. */
export function useLinkListing(designId: string) {
  const api = useListingApi();
  return useListingChange(designId, (again: boolean) =>
    api.linkListing({ id: designId, ...(again && { again }) }),
  );
}

export function usePublishListing(designId: string) {
  const api = useListingApi();
  return useListingChange(designId, () => api.publishListing({ id: designId }));
}

/** Reads the listing's state on Etsy again, e.g. after a pause or deletion there. */
export function useRefreshListing(designId: string) {
  const api = useListingApi();
  return useListingChange(designId, () => api.refreshListing({ id: designId }));
}

/** Swaps the photos of the design's Etsy draft for these, main photo first. */
export function useReplaceListingPhotos(designId: string) {
  const api = useListingApi();
  return useListingChange(designId, (mockupIds: readonly string[]) =>
    api.replaceListingPhotos({ designId, mockupIds: [...mockupIds] }),
  );
}

/** Reads the photos the Etsy listing and the linked Printful files have now. */
export function useLivePhotos(designId: string) {
  const api = useListingApi();
  return useMutation({ mutationFn: () => api.listingPhotos({ id: designId }) });
}

/** Creates the Etsy draft; a shop that changed its currency is read again. */
export function useCreateListing(designId: string) {
  const api = useListingApi();
  const queryClient = useQueryClient();
  const create = useListingChange(designId, (request: CreateListingRequest) =>
    api.createListing(request),
  );
  return {
    isPending: create.isPending,
    error: create.error,
    mutate: (request: CreateListingRequest, onCurrencyChanged: () => void) => {
      create.mutate(request, {
        onError: (error) => {
          if (apiErrorCode(error) !== 'SHOP_CURRENCY_CHANGED') return;
          onCurrencyChanged();
          void queryClient.invalidateQueries({ queryKey: queryKeys.shopOptions });
        },
      });
    },
  };
}
