import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_LOG_BYTES, MainLog } from './main-log.js';

describe('MainLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes errors without the links and tokens they carry', async () => {
    const folder = join(dir, 'logs');
    const log = new MainLog(folder);

    await log.write(
      new Error(
        'PUT https://acc.r2.cloudflarestorage.com/pod/a.png?X-Amz-Signature=abc123 failed; ' +
          'sent Authorization: Bearer pina_secret-token',
      ),
    );
    await log.write('second');

    const text = readFileSync(join(folder, 'main.log'), 'utf8');
    expect(text).toContain('https://acc.r2.cloudflarestorage.com/pod/a.png failed');
    expect(text).toContain('Bearer [hidden]');
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('pina_secret-token');
    expect(text.trim().split('\n').at(-1)).toMatch(/^\d{4}-\d\d-\d\dT.* second$/);
  });

  it('starts a new log and keeps the previous one when the log grew too large', async () => {
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(MAX_LOG_BYTES + 1));

    await new MainLog(dir).write('fresh');

    expect(readFileSync(join(dir, 'main.old.log'), 'utf8')).toHaveLength(MAX_LOG_BYTES + 1);
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toMatch(/ fresh\n$/);
  });

  it('keeps a log of exactly the largest size', async () => {
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(MAX_LOG_BYTES));

    await new MainLog(dir).write('later');

    expect(existsSync(join(dir, 'main.old.log'))).toBe(false);
  });

  it('keeps a small log as it is', async () => {
    writeFileSync(join(dir, 'main.log'), 'earlier\n');

    await new MainLog(dir).write('later');

    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toMatch(/^earlier\n.* later\n$/);
    expect(existsSync(join(dir, 'main.old.log'))).toBe(false);
  });

  it('never fails the caller when the log cannot be written', async () => {
    const file = join(dir, 'not-a-folder');
    writeFileSync(file, '');

    await expect(new MainLog(file).write('lost')).resolves.toBeUndefined();
  });
});
