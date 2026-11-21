import { describe, expect, it } from 'vitest';
import { decodeText } from './decode-text.js';

const utf16 = (text: string, littleEndian: boolean) => {
  const bytes = new Uint8Array(2 + text.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xfeff, littleEndian);
  for (let index = 0; index < text.length; index++) {
    view.setUint16(2 + index * 2, text.charCodeAt(index), littleEndian);
  }
  return bytes;
};

describe('decodeText', () => {
  it('reads UTF-8 and keeps its byte order mark for the reader to drop', () => {
    expect(decodeText(new TextEncoder().encode('﻿Keyword\nkatzen tässe'))).toBe(
      '﻿Keyword\nkatzen tässe',
    );
  });

  it('reads UTF-16 in either byte order by its mark', () => {
    expect(decodeText(utf16('Keyword\ntässe', true))).toBe('Keyword\ntässe');
    expect(decodeText(utf16('Keyword\ntässe', false))).toBe('Keyword\ntässe');
  });

  it('falls back to Windows-1252 when the bytes are not UTF-8', () => {
    expect(decodeText(new Uint8Array([0x74, 0xe4, 0x73, 0x73, 0x65, 0x20, 0x80]))).toBe('tässe €');
  });
});
