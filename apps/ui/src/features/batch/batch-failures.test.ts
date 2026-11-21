import { describe, expect, it } from 'vitest';
import type { ApiErrorPayload, BatchFailureDto } from '@pod/contracts/client';
import { retriable } from './batch-failures.js';

const unconfirmed: ApiErrorPayload = {
  code: 'DRAFT_UNCONFIRMED',
  message: 'Etsy did not confirm the new draft',
  details: {},
};

function failure(error: ApiErrorPayload, draftCheck: ApiErrorPayload | null): BatchFailureDto {
  return { designId: 'id-01-mug', designKey: '01-mug', step: 'draft', error, draftCheck };
}

describe('retriable', () => {
  it('retries a design that stopped for something else than a draft that may exist', () => {
    expect(retriable(failure({ ...unconfirmed, code: 'PROVIDER_FAILED' }, null))).toBe(true);
    expect(retriable(failure({ ...unconfirmed, code: 'PROVIDER_FAILED' }, unconfirmed))).toBe(true);
    expect(retriable(failure({ ...unconfirmed, message: 'other' }, unconfirmed))).toBe(true);
  });

  it('leaves a design that only waits for the drafts to be checked', () => {
    expect(retriable(failure(unconfirmed, unconfirmed))).toBe(false);
  });
});
