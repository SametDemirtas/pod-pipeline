import type { TemporaryFile } from '../ports/downloads.js';
import type { UpscaleRequest, Upscaler } from '../ports/upscaler.js';
import type { StopSignal, WrittenPng } from '../ports/work.js';
import type { ImageInfo } from '../ports/files.js';
import type { ImageScaler } from '../ports/image-scaler.js';
import type { Size } from '../print/placement.js';
import type { FakeSourceFolder } from './fakes.js';

/** Writes a four times larger copy of the sample artwork into the folder. */
export class FakeUpscaler implements Upscaler {
  readonly scale = 4;
  readonly requests: UpscaleRequest[] = [];
  failWith: Error | undefined;
  /** What the engine writes instead, e.g. an image of the wrong size. */
  output: ImageInfo | null = { mimeType: 'image/png', width: 3840 * 4, height: 1648 * 4 };

  constructor(private readonly folder: FakeSourceFolder) {}

  upscale(request: UpscaleRequest): Promise<TemporaryFile> {
    this.requests.push(request);
    if (this.failWith) return Promise.reject(this.failWith);
    request.onProgress?.(1);
    const relativePath = `upscaled/${String(this.requests.length)}.png`;
    this.folder.write({
      relativePath,
      content: `larger ${request.image.absolutePath}`,
      image: this.output,
    });
    return Promise.resolve({
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    });
  }
}

/** Records what it was asked for and writes a PNG of that size into the folder. */
export class FakeImageScaler implements ImageScaler {
  readonly requests: { source: string; size: Size; signal?: StopSignal | undefined }[] = [];
  /** How large the written files are. */
  byteSize = 40_000_000;

  constructor(private readonly folder: FakeSourceFolder) {}

  scale(source: string, size: Size, signal?: StopSignal): Promise<WrittenPng> {
    this.requests.push({ source, size, signal });
    const relativePath = `scaled/${String(this.requests.length)}.png`;
    this.folder.write({
      relativePath,
      content: `${this.folder.contentAt(source)} at ${String(size.width)}`,
      image: { mimeType: 'image/png', ...size },
    });
    return Promise.resolve({
      ...size,
      byteSize: this.byteSize,
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    });
  }
}
