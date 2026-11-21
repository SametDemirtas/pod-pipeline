import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HtmlPinComposer } from './html-pin-composer.js';
import { pinPage } from './pin-template.js';

describe('pinPage', () => {
  it('is a 2:3 page that loads nothing but the inline photo', () => {
    const page = pinPage({ photo: 'data:image/png;base64,AAAA', headline: 'Tulip mug' });

    expect(page).toContain('width:1000px;height:1500px');
    expect(page).toContain("default-src 'none'; img-src data:");
    expect(page).toContain('<img src="data:image/png;base64,AAAA"');
    expect(page).toContain('font-size:88px">Tulip mug</p>');
  });

  it('escapes the headline and leaves the band out without one', () => {
    const page = pinPage({ photo: 'data:x', headline: '<script>"&"</script>' });

    expect(page).toContain('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
    expect(page).not.toContain('<script>');
    expect(pinPage({ photo: 'data:x', headline: '  ' })).not.toContain('class="band"');
  });

  it('sets longer headlines smaller', () => {
    const size = (headline: string) =>
      /font-size:(\d+)px/.exec(pinPage({ photo: 'd', headline }))?.[1];

    expect(size('x'.repeat(24))).toBe('88');
    expect(size('x'.repeat(40))).toBe('72');
    expect(size('x'.repeat(60))).toBe('60');
  });
});

describe('HtmlPinComposer', () => {
  it('renders the photo inline and keeps the picture as a temporary file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pin-'));
    const photo = join(folder, 'photo.jpg');
    await writeFile(photo, 'jpeg');
    const rendered: string[] = [];
    const written: Uint8Array[] = [];
    const composer = new HtmlPinComposer({
      renderPng: (html) => {
        rendered.push(html);
        return Promise.resolve(new Uint8Array([1, 2]));
      },
      writeTemporary: (bytes) => {
        written.push(bytes);
        return Promise.resolve({ absolutePath: '/tmp/pin', dispose: () => Promise.resolve() });
      },
    });

    const file = await composer.compose({
      photo: { absolutePath: photo, mimeType: 'image/jpeg' },
      headline: 'Spooky',
    });

    expect(file.absolutePath).toBe('/tmp/pin');
    expect(rendered[0]).toContain(
      `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`,
    );
    expect(written).toEqual([new Uint8Array([1, 2])]);
  });
});
