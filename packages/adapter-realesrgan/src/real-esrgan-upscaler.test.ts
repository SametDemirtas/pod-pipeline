import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemporaryFile } from '@pod/core';
import {
  RealEsrganUpscaler,
  UpscaleFailedError,
  UpscaleStoppedError,
  KILL_AFTER_MS,
  type StartProcess,
} from './index.js';

class FakeChild extends EventEmitter {
  /** `undefined` for a process that never started. */
  pid: number | undefined = 4242;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);

  report(text: string) {
    this.stderr.write(text);
  }

  finish(code: number) {
    this.emit('close', code);
  }
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-upscale-'));
});

function setUp(timeoutMs = 60_000, newFile?: (output: TemporaryFile) => Promise<TemporaryFile>) {
  const child = new FakeChild();
  const dispose = vi.fn(() => Promise.resolve());
  // The engine's image, as the fake engine leaves the file the way a real one would.
  const absolutePath = join(dir, 'up-1.png');
  writeFileSync(absolutePath, 'png');
  const output: TemporaryFile = { absolutePath, dispose };
  const start = vi.fn<StartProcess>(() => child as unknown as ChildProcess);
  const upscaler = new RealEsrganUpscaler({
    executable: '/engine/realesrgan-ncnn-vulkan',
    modelsDirectory: '/engine/models',
    newFile: () => (newFile ? newFile(output) : Promise.resolve(output)),
    start,
    tileSize: 256,
    timeoutMs,
  });
  return { child, output, dispose, start, upscaler };
}

const image = { absolutePath: '/art/tulip.png', mimeType: 'image/png' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

/** A 2 × 1 JPEG whose EXIF orientation 6 shows it turned a quarter. */
const TURNED_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffe100224578696600004d4d002a00000008000101120003000000010006000000000000ffc00011080001000203000000000000000000ffd9',
  'hex',
);

describe('RealEsrganUpscaler', () => {
  it('runs the engine four times larger, in tiles, with the chosen model', async () => {
    const { child, output, start, upscaler } = setUp();

    const result = upscaler.upscale({ image, model: 'illustration' });
    await flush();
    child.finish(0);

    await expect(result).resolves.toBe(output);
    expect(upscaler.scale).toBe(4);
    expect(start).toHaveBeenCalledWith('/engine/realesrgan-ncnn-vulkan', [
      '-i',
      '/art/tulip.png',
      '-o',
      output.absolutePath,
      '-n',
      'realesrgan-x4plus-anime',
      '-s',
      '4',
      '-t',
      '256',
      '-m',
      '/engine/models',
      '-f',
      'png',
    ]);
  });

  it('uses the general model for photos', async () => {
    const { child, start, upscaler } = setUp();

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.finish(0);
    await result;

    expect(start.mock.calls[0]?.[1]).toContain('realesrgan-x4plus');
    expect(start.mock.calls[0]?.[1]).not.toContain('realesrgan-x4plus-anime');
  });

  it('reports the share done as the engine prints it', async () => {
    const { child, upscaler } = setUp();
    const onProgress = vi.fn();

    const result = upscaler.upscale({ image, model: 'photo', onProgress });
    await flush();
    child.report('0.00%\n12.50%\r\nfind_blob_index_by_name failed\n');
    child.report('100.00%\n');
    await flush();
    child.finish(0);
    await result;

    expect(onProgress.mock.calls.map(([share]) => share as number)).toEqual([0, 0.125, 1]);
  });

  it('fails with what the engine printed, and removes the unfinished file', async () => {
    const { child, dispose, upscaler } = setUp();

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.report('[0 Apple M2]  queueC=0[1]\n12.');
    child.report('50%\nvkCreateInstance failed -9\n50.00%');
    await flush();
    child.finish(255);

    await expect(result).rejects.toMatchObject({
      reason: '[0 Apple M2]  queueC=0[1]\nvkCreateInstance failed -9',
    });
    expect(dispose).toHaveBeenCalled();
  });

  it('names the exit code when the engine printed nothing', async () => {
    const { child, upscaler } = setUp();

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.finish(3);

    await expect(result).rejects.toThrow('exit 3');
  });

  it('fails when the engine cannot start', async () => {
    const { child, upscaler } = setUp();
    child.pid = undefined;

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.emit('error', new Error('spawn ENOENT'));

    await expect(result).rejects.toThrow(new UpscaleFailedError('spawn ENOENT'));
  });

  it('asks the engine to end when stopped, and settles only once it is gone', async () => {
    const { child, dispose, upscaler } = setUp();
    const controller = new AbortController();
    const settled = vi.fn();

    const result = upscaler.upscale({ image, model: 'photo', signal: controller.signal });
    void result.catch(settled);
    await flush();
    controller.abort();
    await flush();

    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(settled).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    child.finish(143);
    await expect(result).rejects.toBeInstanceOf(UpscaleStoppedError);
    expect(dispose).toHaveBeenCalled();
  });

  it('kills an engine that does not end within five seconds', async () => {
    vi.useFakeTimers();
    const { child, dispose, upscaler } = setUp();
    const controller = new AbortController();

    const result = upscaler.upscale({ image, model: 'photo', signal: controller.signal });
    const stopped = expect(result).rejects.toBeInstanceOf(UpscaleStoppedError);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(KILL_AFTER_MS - 1);
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(1);

    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
    expect(dispose).not.toHaveBeenCalled();
    child.finish(137);
    await stopped;
    expect(dispose).toHaveBeenCalled();
  });

  it('waits for an engine that failed after it started', async () => {
    const { child, upscaler } = setUp();
    const settled = vi.fn();

    const result = upscaler.upscale({ image, model: 'photo' });
    void result.catch(settled);
    await flush();
    child.emit('error', new Error('EPIPE'));
    await flush();

    expect(settled).not.toHaveBeenCalled();
    child.finish(0);
    await expect(result).rejects.toThrow(new UpscaleFailedError('EPIPE'));
  });

  it('does not start when already asked to stop', async () => {
    const { start, upscaler } = setUp();
    const controller = new AbortController();
    controller.abort();

    await expect(
      upscaler.upscale({ image, model: 'photo', signal: controller.signal }),
    ).rejects.toBeInstanceOf(UpscaleStoppedError);
    expect(start).not.toHaveBeenCalled();
  });

  it('stops the engine after the time limit', async () => {
    vi.useFakeTimers();
    const { child, upscaler } = setUp(90_000);

    const result = upscaler.upscale({ image, model: 'photo' });
    const failure = expect(result).rejects.toThrow('no result after 90 s');
    await vi.advanceTimersByTimeAsync(90_000);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.finish(143);
    await failure;
  });

  it('kills an engine that failed after it started when it is then stopped', async () => {
    const { child, upscaler } = setUp();
    const controller = new AbortController();

    const result = upscaler.upscale({ image, model: 'photo', signal: controller.signal });
    const failure = expect(result).rejects.toThrow(new UpscaleFailedError('EPIPE'));
    await flush();
    child.emit('error', new Error('EPIPE'));
    controller.abort();

    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    child.finish(143);
    await failure;
  });

  it('does not start when stopped while its result file is being made', async () => {
    const controller = new AbortController();
    const { dispose, start, upscaler } = setUp(60_000, (output) => {
      controller.abort();
      return Promise.resolve(output);
    });

    await expect(
      upscaler.upscale({ image, model: 'photo', signal: controller.signal }),
    ).rejects.toBeInstanceOf(UpscaleStoppedError);
    expect(start).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
  });

  it('drains what the engine writes to its standard output', async () => {
    const { child, upscaler } = setUp();

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();

    expect(child.stdout.readableFlowing).toBe(true);
    child.finish(0);
    await result;
  });

  it('fails with what the engine printed when it ends well but wrote nothing', async () => {
    const { child, dispose, output, upscaler } = setUp();
    writeFileSync(output.absolutePath, '');

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.report('decode image /art/tulip.png failed\n');
    child.finish(0);

    await expect(result).rejects.toThrow(
      new UpscaleFailedError('decode image /art/tulip.png failed'),
    );
    expect(dispose).toHaveBeenCalled();
  });

  it('fails when the engine ends well but its image is missing', async () => {
    const { child, output, upscaler } = setUp();
    rmSync(output.absolutePath);

    const result = upscaler.upscale({ image, model: 'photo' });
    await flush();
    child.finish(0);

    await expect(result).rejects.toThrow(new UpscaleFailedError('no image was written'));
  });

  it('refuses a JPEG its EXIF orientation turns, which the engine would not', async () => {
    const { start, upscaler } = setUp();
    const turned = join(dir, 'turned.jpg');
    writeFileSync(turned, TURNED_JPEG);

    await expect(
      upscaler.upscale({ image: { absolutePath: turned, mimeType: 'image/jpeg' }, model: 'photo' }),
    ).rejects.toThrow('EXIF orientation');
    expect(start).not.toHaveBeenCalled();
  });

  it('gives up on a killed engine that never ends', async () => {
    vi.useFakeTimers();
    const { child, dispose, upscaler } = setUp();
    const controller = new AbortController();

    const result = upscaler.upscale({ image, model: 'photo', signal: controller.signal });
    const stopped = expect(result).rejects.toBeInstanceOf(UpscaleStoppedError);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2 * KILL_AFTER_MS);

    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
    await stopped;
    expect(dispose).toHaveBeenCalled();
  });
});
