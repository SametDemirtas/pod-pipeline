import { describe, expect, it } from 'vitest';
import { connect, fakeApi, researchRun } from '../testing/fake-catalog-api.js';

describe('research tools', () => {
  it('maps research tools to API requests', async () => {
    const api = fakeApi();
    const client = await connect(api);

    const run = await client.callTool({
      name: 'research_etsy',
      arguments: { query: ' tulip mug ' },
    });
    await client.callTool({
      name: 'research_etsy',
      arguments: { query: 'geister tasse', market: 'DE' },
    });
    const list = await client.callTool({ name: 'list_research', arguments: {} });
    const one = await client.callTool({ name: 'get_research', arguments: { id: 'r1' } });

    expect(api.researchKeywords).toHaveBeenNthCalledWith(1, { query: 'tulip mug' });
    expect(api.researchKeywords).toHaveBeenNthCalledWith(2, {
      query: 'geister tasse',
      market: 'DE',
    });
    expect(run.structuredContent).toEqual(researchRun);
    expect(list.structuredContent).toMatchObject({ runs: [{ id: 'r1', topTerms: ['tulip mug'] }] });
    expect(api.getResearch).toHaveBeenCalledWith({ id: 'r1' });
    expect(one.structuredContent).toEqual(researchRun);
  });
});
