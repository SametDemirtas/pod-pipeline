import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { DRAFT_MAY_EXIST_CODES, type ApiErrorCode } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { apiErrorCode } from '../../shared/api-error-code.js';

const useDraftsCheckApi = scopedApi<'confirmDraftsChecked'>();

const DRAFT_MAY_EXIST: ReadonlySet<ApiErrorCode | null> = new Set(DRAFT_MAY_EXIST_CODES);

/**
 * Whether to ask the seller to check the shop's drafts before creating one
 * again, after `createError`. Only a stored answer settles the question, so a
 * failed one asks again.
 */
export function useDraftsCheck(designId: string, createError: unknown) {
  const api = useDraftsCheckApi();
  // The error the seller answered by checking the drafts on Etsy; a new one asks again.
  const [answered, setAnswered] = useState<unknown>(null);
  const check = useMutation({
    mutationFn: () => api.confirmDraftsChecked({ id: designId }),
  });
  const draftMayExist = DRAFT_MAY_EXIST.has(apiErrorCode(createError));
  return {
    draftMayExist,
    ask: draftMayExist && answered !== createError,
    pending: check.isPending,
    error: check.error,
    /** Tells the app the drafts were checked, then runs `then`. */
    confirm: (then: () => void) => {
      check.mutate(undefined, {
        onSuccess: () => {
          setAnswered(createError);
          then();
        },
      });
    },
  };
}

export type DraftsCheck = ReturnType<typeof useDraftsCheck>;
