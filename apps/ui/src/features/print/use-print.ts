import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type FitModeDto, type PrintRequest } from '@pod/contracts/client';
import { familyProfileOf } from '@pod/rules';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { apiErrorCode } from '../../shared/api-error-code.js';
import { missingConnection } from '../../shared/missing-connection.js';
import { useMockups } from '../mockups/use-mockups.js';

const usePrintApi = scopedApi<'checkPrint'>();

export interface PrintChoice {
  readonly variantId?: string | undefined;
  readonly printArea?: string | undefined;
  readonly fit: FitModeDto;
}

/** One shape per request, so equal requests always share a cached check. */
export function printRequest(designId: string, choice: PrintChoice): PrintRequest {
  return {
    designId,
    ...(choice.variantId === undefined ? {} : { variantId: choice.variantId }),
    ...(choice.printArea === undefined ? {} : { printArea: choice.printArea }),
    fit: choice.fit,
  };
}

export function usePrintCheck(request: PrintRequest) {
  const api = usePrintApi();
  return useQuery({
    queryKey: queryKeys.printCheck(request),
    queryFn: () => api.checkPrint(request),
    placeholderData: keepPreviousData,
    // The print check and the listing form share it; Printful's sizes rarely change,
    // and a second view of a failed check offers its own retry instead of asking again.
    staleTime: 60_000,
    retryOnMount: false,
    // Retrying cannot fix a missing product, variant or connection; the user has to act.
    retry: (failures, error) =>
      !isUnavailable(error) &&
      !isNotFound(error) &&
      missingConnection(error) === null &&
      failures < 2,
  });
}

/** Where the design stands in printing, from the default check and the stored mockups. */
export function usePrintProgress(designId: string, familyId: string) {
  const check = usePrintCheck(printRequest(designId, { fit: familyProfileOf(familyId).fit }));
  const mockups = useMockups(designId);
  return {
    printable:
      !check.isPending && !isUnavailable(check.error) && missingConnection(check.error) === null,
    checked: check.isSuccess && check.data.quality !== 'poor',
    hasMockups: (mockups.data?.length ?? 0) > 0,
  };
}

/** The design's product cannot be printed yet; not a failure worth retrying. */
export function isUnavailable(error: unknown): boolean {
  return apiErrorCode(error) === 'PRINT_PRODUCT_UNAVAILABLE';
}

export function isNotFound(error: unknown): boolean {
  return apiErrorCode(error) === 'NOT_FOUND';
}
