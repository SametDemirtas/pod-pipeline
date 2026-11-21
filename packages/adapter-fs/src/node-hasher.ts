import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Hasher } from '@pod/core';

export class NodeHasher implements Hasher {
  async hashFile(absolutePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(absolutePath)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  hashText(text: string): Promise<string> {
    return Promise.resolve(createHash('sha256').update(text, 'utf8').digest('hex'));
  }
}
