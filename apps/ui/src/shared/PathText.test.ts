import { describe, expect, it } from 'vitest';
import { shortPath } from './PathText.js';

describe('shortPath', () => {
  it.each([
    ['/Users/me/Designs/01. Kırağı Bahçesi/Kupa.png', '01. Kırağı Bahçesi/Kupa.png'],
    ['C:\\Designs\\01. Winter\\Mug.png', '01. Winter/Mug.png'],
    ['/Designs/', 'Designs'],
    ['Mug.png', 'Mug.png'],
    ['/', '/'],
  ])('shortens %j to %j', (path, short) => {
    expect(shortPath(path)).toBe(short);
  });

  it.each([
    ['/var/folders/T/pod-designs', 'pod-designs'],
    ['C:\\Designs\\Autumn\\', 'Autumn'],
    ['/', '/'],
  ])('names the folder %j %j', (path, name) => {
    expect(shortPath(path, true)).toBe(name);
  });
});
