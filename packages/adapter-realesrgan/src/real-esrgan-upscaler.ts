import type { ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { imageSizeFromFile } from 'image-size/fromFile';
import type { TemporaryFile, UpscaleModel, UpscaleRequest, Upscaler } from '@pod/core';
import { UpscaleFailedError, UpscaleStoppedError } from './errors.js';

/** Real-ESRGAN's models, by what the artwork is treated as; both make it four times larger. */
const MODELS: Readonly<Record<UpscaleModel, string>> = {
  illustration: 'realesrgan-x4plus-anime',
  photo: 'realesrgan-x4plus',
};

/** Starts the engine; `spawn` of `node:child_process` in the app. */
export type StartProcess = (command: string, args: readonly string[]) => ChildProcess;

export interface RealEsrganOptions {
  /** The engine's executable, `realesrgan-ncnn-vulkan`. */
  readonly executable: string;
  /** The folder holding the models' `.param` and `.bin` files. */
  readonly modelsDirectory: string;
  /**
   * A new file for the result, ending in `.png`, as the engine picks the format by
   * the name; named so a start-up sweep removes it if the app stops.
   */
  readonly newFile: () => Promise<TemporaryFile>;
  readonly start: StartProcess;
  /** Pixels per side of the tiles the engine works in; smaller ones need less memory. */
  readonly tileSize: number;
  readonly timeoutMs: number;
}

/** How long a stopped engine has to exit before it is killed, and a killed one before it is given up on. */
export const KILL_AFTER_MS = 5_000;

/** The engine's error output: lines of progress, e.g. `42.50%`, and anything else. */
class EngineOutput {
  private partial = '';
  private messages: string[] = [];

  constructor(private readonly onProgress: ((share: number) => void) | undefined) {}

  add(text: string): void {
    const lines = `${this.partial}${text}`.split(/\r?\n|\r/);
    this.partial = lines.pop() ?? '';
    for (const line of lines) this.line(line);
  }

  /** The last lines the engine said besides its progress. */
  errors(): string {
    if (this.partial !== '') this.line(this.partial);
    this.partial = '';
    return this.messages.join('\n');
  }

  private line(line: string): void {
    const progress = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(line);
    if (progress) this.onProgress?.(Math.min(1, Number(progress[1]) / 100));
    else if (line.trim() !== '') this.messages = [...this.messages.slice(-19), line.trim()];
  }
}

/**
 * Real-ESRGAN's ncnn Vulkan engine, run as a child process on the GPU, tile by
 * tile, so large artwork fits in memory. Stopped on request and after a time limit.
 */
export class RealEsrganUpscaler implements Upscaler {
  readonly scale = 4;

  constructor(private readonly options: RealEsrganOptions) {}

  async upscale(request: UpscaleRequest): Promise<TemporaryFile> {
    if (request.signal?.aborted) throw new UpscaleStoppedError();
    if (await turnedByExif(request.image)) {
      throw new UpscaleFailedError(
        'the JPEG is turned by its EXIF orientation, which the engine does not follow; save it upright and import it again',
      );
    }
    const output = await this.options.newFile();
    try {
      if (request.signal?.aborted) throw new UpscaleStoppedError();
      const messages = await this.run(request, output.absolutePath);
      // The engine ends with 0 even when it could not read or write an image.
      if (!(await holdsData(output.absolutePath))) {
        throw new UpscaleFailedError(messages || 'no image was written');
      }
      return output;
    } catch (error) {
      await output.dispose();
      throw error;
    }
  }

  private engineArgs(request: UpscaleRequest, outputPath: string): string[] {
    const { modelsDirectory, tileSize } = this.options;
    return [
      '-i',
      request.image.absolutePath,
      '-o',
      outputPath,
      '-n',
      MODELS[request.model],
      '-s',
      String(this.scale),
      '-t',
      String(tileSize),
      '-m',
      modelsDirectory,
      '-f',
      'png',
    ];
  }

  /** Runs the engine to its end; what it printed besides its progress. */
  private run(request: UpscaleRequest, outputPath: string): Promise<string> {
    const { executable, timeoutMs } = this.options;
    const child = this.options.start(executable, this.engineArgs(request, outputPath));
    return new Promise((resolve, reject) => {
      const output = new EngineOutput(request.onProgress);
      let failure: Error | undefined;
      let terminating = false;
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const settle = (error: Error | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(limitTimer);
        clearTimeout(killTimer);
        request.signal?.removeEventListener('abort', stop);
        if (error) reject(error);
        else resolve(output.errors());
      };
      // Asked to end, the engine gets time to free the graphics card before it is killed.
      const terminate = (reason: Error) => {
        if (terminating) return;
        terminating = true;
        failure ??= reason;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          child.kill('SIGKILL');
          // A process stuck in the graphics driver may never close; the work still ends.
          killTimer = setTimeout(() => {
            settle(failure);
          }, KILL_AFTER_MS);
        }, KILL_AFTER_MS);
      };
      const stop = () => {
        terminate(new UpscaleStoppedError());
      };
      const limitTimer = setTimeout(() => {
        terminate(
          new UpscaleFailedError(`no result after ${String(Math.round(timeoutMs / 1000))} s`),
        );
      }, timeoutMs);
      request.signal?.addEventListener('abort', stop);
      child.stdout?.resume();
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (text: string) => {
        output.add(text);
      });
      child.on('error', (error) => {
        // Without a process there is no close to wait for.
        if (child.pid === undefined) settle(new UpscaleFailedError(error.message));
        else failure ??= new UpscaleFailedError(error.message);
      });
      // Settles once the engine is gone, so its output file is no longer written.
      child.on('close', (code) => {
        const reason = output.errors() || `exit ${String(code)}`;
        settle(failure ?? (code === 0 ? undefined : new UpscaleFailedError(reason)));
      });
    });
  }
}

/** Whether the file exists and is not empty. */
async function holdsData(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Whether a JPEG's EXIF orientation turns or mirrors its pixels; unreadable headers count as upright. */
async function turnedByExif(image: UpscaleRequest['image']): Promise<boolean> {
  if (image.mimeType !== 'image/jpeg') return false;
  try {
    const { orientation } = await imageSizeFromFile(image.absolutePath);
    return orientation !== undefined && orientation > 1;
  } catch {
    return false;
  }
}
