import { describe, expect, it } from 'vitest';
import { connect, fakeApi, pin } from '../testing/fake-catalog-api.js';

describe('pin tools', () => {
  it('read boards and pins, and only propose new pins', async () => {
    const api = fakeApi();
    const client = await connect(api);
    const args = {
      design_id: 'd1',
      mockup_id: 'm1',
      title: 'Tulip mug',
      description: '',
      alt_text: '',
      headline: 'Spooky',
      board_id: '11',
      publish_at: '2026-11-02T18:00:00+01:00',
    };

    const boards = await client.callTool({ name: 'list_pinterest_boards', arguments: {} });
    const pins = await client.callTool({ name: 'list_pins', arguments: { design_id: 'd1' } });
    const proposed = await client.callTool({ name: 'propose_pin', arguments: args });
    const refused = await client.callTool({
      name: 'propose_pin',
      arguments: { ...args, publish_at: 'next friday' },
    });

    expect(boards.structuredContent).toEqual({ boards: [{ id: '11', name: 'Mugs' }] });
    expect(api.listPins).toHaveBeenCalledWith({ id: 'd1' });
    expect(pins.structuredContent).toEqual({ pins: [pin] });
    expect(api.proposePin).toHaveBeenCalledWith({
      designId: 'd1',
      mockupId: 'm1',
      title: 'Tulip mug',
      description: '',
      altText: '',
      headline: 'Spooky',
      boardId: '11',
      publishAt: '2026-11-02T18:00:00+01:00',
    });
    expect(proposed.structuredContent).toMatchObject({ id: 'p1', state: 'proposed' });
    expect(refused.isError).toBe(true);
  });
});
