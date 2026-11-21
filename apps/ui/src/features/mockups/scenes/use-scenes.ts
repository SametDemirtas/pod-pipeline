import {
  keepPreviousData,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { MockupDto, SceneLookDto } from '@pod/contracts/client';
import { scopedApi } from '../../../api/api-context.js';
import { queryKeys } from '../../../api/query-keys.js';
import { useCachedChange } from '../../../shared/use-cached-change.js';

const useScenesApi = scopedApi<
  | 'checkSceneAgain'
  | 'confirmScenePrint'
  | 'createScene'
  | 'describeSceneStyle'
  | 'previewSceneLook'
>();

export function useCreateScene(designId: string) {
  const api = useScenesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.createScene(designId),
    mutationFn: (input: {
      mockupId: string;
      prompt: string;
      look: SceneLookDto;
      candidates: 1 | 2;
    }) => api.createScene({ designId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mockups(designId) }),
  });
}

/**
 * The line a look adds to the scene prompt and the options offered for the family,
 * asked for only while the look is shown; the previous answer stays while the next loads.
 */
export function useSceneLookPreview(familyId: string, look: SceneLookDto, enabled: boolean) {
  const api = useScenesApi();
  return useQuery({
    queryKey: queryKeys.sceneLook(familyId, look),
    queryFn: () => api.previewSceneLook({ familyId, look }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** True while the text service describes the style of a photo for one of the design's scenes. */
export function useDescribingStyle(designId: string): boolean {
  return useIsMutating({ mutationKey: queryKeys.describeStyle(designId) }) > 0;
}

/** True while a scene of the design is being generated, also one started before. */
export function useSceneRunning(designId: string): boolean {
  return useIsMutating({ mutationKey: queryKeys.createScene(designId) }) > 0;
}

/** Records that the seller checked a scene's print, or takes that back. */
export function useConfirmScenePrint(designId: string) {
  const api = useScenesApi();
  return useMockupChange(designId, (input: { mockupId: string; confirmed: boolean }) =>
    api.confirmScenePrint({ designId, ...input }),
  );
}

/** Has the text service compare a scene with its photo again. */
export function useCheckSceneAgain(designId: string) {
  const api = useScenesApi();
  return useMockupChange(designId, (mockupId: string) =>
    api.checkSceneAgain({ designId, mockupId }),
  );
}

/** A change to one photo, which comes back changed and takes the cached one's place. */
function useMockupChange<T>(designId: string, change: (input: T) => Promise<MockupDto>) {
  return useCachedChange<T, MockupDto, readonly MockupDto[] | undefined>({
    queryKey: queryKeys.mockups(designId),
    change,
    // Photos not read yet stay unread rather than become an empty list.
    toCache: (changed, photos) =>
      photos?.map((photo) => (photo.id === changed.id ? changed : photo)),
  });
}

/**
 * Has the text service describe the style of a dropped photo, given as base64, or of
 * one the seller picks when there is none.
 */
export function useDescribeSceneStyle(designId: string) {
  const api = useScenesApi();
  return useMutation({
    mutationKey: queryKeys.describeStyle(designId),
    mutationFn: (image?: string) =>
      api.describeSceneStyle(image === undefined ? { designId } : { designId, image }),
  });
}
