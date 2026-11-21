import { readFile } from 'node:fs/promises';
import type { TemporaryFile, PinComposer, PinImageRequest } from '@pod/core';
import { pinPage } from './pin-template.js';

export interface HtmlPinComposerOptions {
  /** Renders the page offscreen and returns it as PNG bytes. */
  readonly renderPng: (html: string) => Promise<Uint8Array>;
  readonly writeTemporary: (bytes: Uint8Array) => Promise<TemporaryFile>;
}

/** Lays a pin out as a web page and captures it, so text renders like any page does. */
export class HtmlPinComposer implements PinComposer {
  constructor(private readonly options: HtmlPinComposerOptions) {}

  async compose(request: PinImageRequest): Promise<TemporaryFile> {
    const bytes = await readFile(request.photo.absolutePath);
    const photo = `data:${request.photo.mimeType};base64,${bytes.toString('base64')}`;
    const png = await this.options.renderPng(pinPage({ photo, headline: request.headline }));
    return this.options.writeTemporary(png);
  }
}
