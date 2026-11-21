import { expect, it } from 'vitest';
import type { DesignId } from '@pod/core';
import { samplePin } from '@pod/core/testing/contract';
import { toPinDto } from './pin-dtos.js';

it('shows why a pin failed without a token the service named', () => {
  const pin = samplePin('p1', 'design-1' as DesignId, 0, {
    state: 'failed',
    failure: 'Pinterest returned 401 for Bearer pina_AbCd-123_xyz',
  });

  expect(toPinDto(pin, { pinUrl: (pinId) => pinId }).failure).toBe(
    'Pinterest returned 401 for Bearer [hidden]',
  );
});
