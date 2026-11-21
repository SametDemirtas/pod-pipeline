import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FakeReply } from '@pod/adapter-http/testing';
import { PinterestApiError, PinterestPublishUncertainError } from './errors.js';
import { PinterestApi } from './pinterest-api.js';
import { clientWith } from './testing/fake-fetch.js';

function apiWith(...replies: FakeReply[]) {
  const { client, calls } = clientWith(...replies);
  return { api: new PinterestApi(client), calls };
}

describe('PinterestApi', () => {
  it('reads every page of boards', async () => {
    const { api, calls } = apiWith(
      { body: { items: [{ id: '11', name: 'Mugs', privacy: 'PUBLIC' }], bookmark: 'b2' } },
      { body: { items: [{ id: '12', name: 'Halloween' }], bookmark: null } },
    );

    expect(await api.boards()).toEqual([
      { id: '11', name: 'Mugs' },
      { id: '12', name: 'Halloween' },
    ]);
    expect(calls().map((call) => call.url)).toEqual([
      'https://api.pinterest.com/v5/boards?page_size=250',
      'https://api.pinterest.com/v5/boards?page_size=250&bookmark=b2',
    ]);
  });

  it('stops at a page limit rather than looping', async () => {
    const page = { body: { items: [], bookmark: 'again' } };
    const { api } = apiWith(...Array.from({ length: 20 }, () => page));

    await expect(api.boards()).rejects.toThrow(/past the last page/);
  });

  it('refuses boards in a shape Pinterest does not document', async () => {
    const { api } = apiWith({ body: { items: [{ id: 'board-11', name: 'Mugs' }] } });

    await expect(api.boards()).rejects.toThrow(/board id is not an id/);
  });

  it('reads the account name', async () => {
    const { api, calls } = apiWith({
      body: { username: 'example-pins', account_type: 'BUSINESS' },
    });

    expect(await api.username()).toBe('example-pins');
    expect(calls()[0]?.url).toBe('https://api.pinterest.com/v5/user_account');
  });

  it('creates a pin with the image inline and labels an AI-changed one', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pin-'));
    const path = join(folder, 'pin.png');
    await writeFile(path, 'png bytes');
    const { api, calls } = apiWith({ body: { id: '987' } }, { body: { id: '988' } });
    const pin = {
      boardId: '11',
      title: 'Tulip mug',
      description: 'A cosy mug.',
      altText: 'A white mug with a tulip',
      link: 'https://www.etsy.com/listing/1',
      image: { absolutePath: path, mimeType: 'image/png' },
      aiModified: true,
    };

    expect(await api.publish(pin)).toBe('987');
    expect(await api.publish({ ...pin, link: null, aiModified: false })).toBe('988');

    expect(calls()[0]?.body).toEqual({
      board_id: '11',
      title: 'Tulip mug',
      description: 'A cosy mug.',
      alt_text: 'A white mug with a tulip',
      link: 'https://www.etsy.com/listing/1',
      media_source: {
        source_type: 'image_base64',
        content_type: 'image/png',
        data: Buffer.from('png bytes').toString('base64'),
      },
      ai_disclosures: { values: ['AI_MODIFIED'] },
    });
    expect(calls()[1]?.body).not.toHaveProperty('link');
    expect(calls()[1]?.body).not.toHaveProperty('ai_disclosures');
  });

  it('reads the image through the reader it is given', async () => {
    const { client, calls } = clientWith({ body: { id: '987' } });
    const read: string[] = [];
    const api = new PinterestApi(client, (path) => {
      read.push(path);
      return Promise.resolve(new TextEncoder().encode('png bytes'));
    });

    await api.publish({
      boardId: '11',
      title: 'Tulip mug',
      description: '',
      altText: '',
      link: null,
      image: { absolutePath: '/pins/tulip.png', mimeType: 'image/png' },
      aiModified: false,
    });

    expect(read).toEqual(['/pins/tulip.png']);
    expect(calls()[0]?.body).toMatchObject({
      media_source: { data: Buffer.from('png bytes').toString('base64') },
    });
  });

  describe('when creating a pin fails', () => {
    async function pinWith(path: string) {
      await writeFile(path, 'png bytes');
      return {
        boardId: '11',
        title: 'Tulip mug',
        description: '',
        altText: '',
        link: null,
        image: { absolutePath: path, mimeType: 'image/png' as const },
        aiModified: false,
      };
    }

    it.each([
      ['a gateway error', { status: 502, body: { message: 'Bad gateway' } }],
      ['an answer without an id', { body: {} }],
    ])('marks %s as uncertain', async (_case, reply: FakeReply) => {
      const folder = await mkdtemp(join(tmpdir(), 'pin-'));
      const { api } = apiWith(reply);

      await expect(api.publish(await pinWith(join(folder, 'pin.png')))).rejects.toBeInstanceOf(
        PinterestPublishUncertainError,
      );
    });

    it('keeps a refused pin a plain error', async () => {
      const folder = await mkdtemp(join(tmpdir(), 'pin-'));
      const { api } = apiWith({ status: 400, body: { message: 'Invalid board' } });

      await expect(api.publish(await pinWith(join(folder, 'pin.png')))).rejects.toBeInstanceOf(
        PinterestApiError,
      );
    });
  });
});
