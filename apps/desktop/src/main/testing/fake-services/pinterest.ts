import { counter, json, jsonOf, route, type FakeService, type Json } from './http.js';

const BOARDS = [
  { id: '900100200300400501', name: 'Tulip Mugs', privacy: 'PUBLIC' },
  { id: '900100200300400502', name: 'Cozy Gifts', privacy: 'PUBLIC' },
];

/**
 * The seller's Pinterest account: its boards and the pins made on them. Each
 * pin's image is kept in `images` as it arrived.
 */
export function fakePinterest(images: Uint8Array[]): FakeService {
  const pins = new Map<string, Json>();
  const pinIds = counter(1);

  return {
    base: 'https://api.pinterest.com/v5',
    signedIn: true,
    missing: () => json({ code: 404, message: 'Not found' }, 404),
    routes: [
      route('GET', '/user_account', () =>
        json({ account_type: 'BUSINESS', username: 'fakepinner', website_url: null }),
      ),
      route('GET', '/boards', () => json({ items: BOARDS, bookmark: null })),
      route('POST', '/pins', async (request) => {
        const body = await jsonOf(request);
        if (!BOARDS.some((board) => board.id === body['board_id'])) {
          return json({ code: 404, message: 'Board not found.' }, 404);
        }
        const media = body['media_source'] as Json | undefined;
        if (media?.['source_type'] !== 'image_base64' || typeof media['data'] !== 'string') {
          return json({ code: 1, message: 'Invalid media_source' }, 400);
        }
        images.push(Buffer.from(media['data'], 'base64'));
        const id = `81200${String(pinIds()).padStart(13, '0')}`;
        const pin = {
          id,
          board_id: body['board_id'],
          title: body['title'],
          description: body['description'],
          alt_text: body['alt_text'],
          link: body['link'] ?? null,
          created_at: new Date().toISOString(),
          media: {
            media_type: 'image',
            images: {
              '600x': { width: 600, height: 600, url: `https://i.pinimg.com/600x/${id}.png` },
            },
          },
        };
        pins.set(id, pin);
        return json(pin, 201);
      }),
      route('GET', '/pins/:id', (_request, [id = '']) => {
        const pin = pins.get(id);
        return pin ? json(pin) : json({ code: 404, message: 'Pin not found.' }, 404);
      }),
    ],
  };
}
