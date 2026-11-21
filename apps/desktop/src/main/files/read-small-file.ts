import { open } from 'node:fs/promises';

/** The file's bytes; `null` once more than `maxBytes` were read, even if the file grew meanwhile. */
export async function readSmallFile(path: string, maxBytes: number): Promise<Uint8Array | null> {
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    for (;;) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) return buffer.subarray(0, length);
      length += bytesRead;
      if (length > maxBytes) return null;
    }
  } finally {
    await file.close();
  }
}
