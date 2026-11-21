import { describe, expect, it } from 'vitest';
import { batchStatus, connect, fakeApi, text } from '../testing/fake-catalog-api.js';

describe('batch tools', () => {
  it('read how far preparing listings got, with why designs stopped', async () => {
    const api = fakeApi();
    const client = await connect(api);

    const result = await client.callTool({ name: 'get_batch_status', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(batchStatus);
    expect(text(result)).toContain('LISTING_PRICE_MISSING');
  });
});
