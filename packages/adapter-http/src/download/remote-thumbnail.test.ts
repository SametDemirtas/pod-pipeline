import { describe, expect, it, vi } from 'vitest';
import { MAX_THUMBNAIL_BYTES, remoteThumbnails } from './remote-thumbnail.js';

function answering(response: Response | Error) {
  return vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

const IMAGE = { 'content-type': 'image/jpeg' };

describe('remoteThumbnails', () => {
  it('turns a downloaded image into a data URL, following no redirect', async () => {
    const fetchFn = answering(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg; q=1' } }),
    );

    expect(await remoteThumbnails(fetchFn)('https://i.etsystatic.com/a.jpg')).toBe(
      'data:image/jpeg;base64,AQID',
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://i.etsystatic.com/a.jpg',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('gives nothing for a failed download, a non-image or a plain http link', async () => {
    const notFound = answering(new Response('gone', { status: 404 }));
    const page = answering(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    const broken = answering(new Error('offline'));
    const unused = answering(new Error('not called'));

    expect(await remoteThumbnails(notFound)('https://x.test/a.jpg')).toBeNull();
    expect(await remoteThumbnails(page)('https://x.test/a.jpg')).toBeNull();
    expect(await remoteThumbnails(broken)('https://x.test/a.jpg')).toBeNull();
    expect(await remoteThumbnails(unused)('http://x.test/a.jpg')).toBeNull();
    expect(await remoteThumbnails(unused)('not a url')).toBeNull();
    expect(unused).not.toHaveBeenCalled();
  });

  it('gives nothing when the server answers with a redirect', async () => {
    const redirected = answering(new TypeError('fetch failed: unexpected redirect'));

    expect(await remoteThumbnails(redirected)('https://x.test/a.jpg')).toBeNull();
  });

  it('refuses an image announced as too large without reading it', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    const fetchFn = answering(
      new Response(body, {
        headers: { ...IMAGE, 'content-length': String(MAX_THUMBNAIL_BYTES + 1) },
      }),
    );

    expect(await remoteThumbnails(fetchFn)('https://x.test/a.jpg')).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it('stops reading an image that turns out too large', async () => {
    const chunk = new Uint8Array(256 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });

    expect(
      await remoteThumbnails(answering(new Response(body, { headers: IMAGE })))(
        'https://x.test/a.jpg',
      ),
    ).toBeNull();
    expect(sent).toBeLessThan(MAX_THUMBNAIL_BYTES + 4 * chunk.length);
  });
});
