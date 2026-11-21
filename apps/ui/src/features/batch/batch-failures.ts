import type { BatchFailureDto } from '@pod/contracts/client';

/** Whether a retry would run something: the design stopped for more than a draft that may exist. */
export function retriable({ error, draftCheck }: BatchFailureDto): boolean {
  return (
    draftCheck === null || error.code !== draftCheck.code || error.message !== draftCheck.message
  );
}
