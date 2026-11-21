import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { png } from '../testing/test-images.js';
import { servePngJobs, type PngReply, type PngRequest } from './png-worker-protocol.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('servePngJobs', () => {
  it('refuses a second job while the first one runs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pod-worker-'));
    dirs.push(dir);
    const source = join(dir, 'in.png');
    writeFileSync(source, png(400, 300));
    let send: (request: PngRequest) => void = () => undefined;
    const replies: PngReply[] = [];
    const done = new Promise<void>((resolve) => {
      servePngJobs({
        on: (_event, listener) => {
          send = listener;
        },
        postMessage: (reply) => {
          replies.push(reply);
          if (replies.length === 2) resolve();
        },
      });
    });
    const job = (name: string) => ({
      source,
      target: join(dir, name),
      size: { width: 40, height: 30 },
    });

    send({ type: 'scale', job: job('first.png') });
    send({ type: 'scale', job: job('second.png') });
    await done;

    expect(replies).toEqual([
      { ok: false, message: 'the worker is already working on an image' },
      { ok: true },
    ]);
  });
});
